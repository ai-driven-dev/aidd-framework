import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, gitInit, identityFileIn, runCli, sinkDirIn } from "./helpers.js";

const LOCAL_COST_FIXTURES = join(process.cwd(), "tests", "fixtures", "local-cost");

const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";
const CODEX_SESSION = "019fae6f-2009-7cd3-86b2-b8f83481b160";
const CLAUDE_RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const CODEX_RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FBW";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

async function seedJournal(
  projectDir: string,
  runId: string,
  vendorId: string,
  tool: string,
  sessionStartAt: string,
  turnEndAt: string
): Promise<void> {
  const runsDir = join(projectDir, "aidd_docs", "runs");
  await mkdir(runsDir, { recursive: true });
  const line = (value: unknown) => `${JSON.stringify(value)}\n`;
  await writeFile(
    join(runsDir, `${runId}__${vendorId}.jsonl`),
    line({
      type: "session_start",
      at: sessionStartAt,
      run_id: runId,
      tool,
      vendor_id: vendorId,
      project_id: "acme-widgets",
    }) + line({ type: "turn_end", at: turnEndAt })
  );
}

// `telemetry read` refuses unless measurement is on, so every sweep here turns it on
// first, the same as a real project would.
async function writeSwitch(projectDir: string, enabled: boolean): Promise<void> {
  await mkdir(join(projectDir, ".aidd"), { recursive: true });
  await writeFile(
    join(projectDir, ".aidd", "config.json"),
    JSON.stringify({ telemetry: { enabled } })
  );
}

async function storedLines(fakeHome: string): Promise<Record<string, unknown>[]> {
  const dir = sinkDirIn(fakeHome);
  const entries = await readdir(dir).catch(() => []);
  const lines: Record<string, unknown>[] = [];
  for (const entry of [...entries].sort().filter((e) => e.endsWith(".jsonl"))) {
    const content = await readFile(join(dir, entry), "utf8");
    for (const raw of content.split("\n").filter((l) => l.trim() !== "")) {
      lines.push(JSON.parse(raw));
    }
  }
  return lines;
}

async function readIdentityFile(home: string): Promise<string | null> {
  try {
    return await readFile(identityFileIn(home), "utf8");
  } catch {
    return null;
  }
}

async function seedIdentity(home: string, personId: string): Promise<void> {
  const filePath = identityFileIn(home);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ person_id: personId }, null, 2)}\n`);
}

describe("aidd telemetry identity — the journey and its edge cases", () => {
  it("walks identity -> use -> use --name -> identity -> off, each state legible from stdout", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-journey");
    try {
      const off = await runCli(["telemetry", "identity"], projectDir, fakeHome);
      expect(off.exitCode, off.stderr).toBe(0);
      expect(off.stdout).toContain("off");
      expect(off.stdout).not.toContain("on,");

      const on = await runCli(["telemetry", "identity", "use"], projectDir, fakeHome);
      expect(on.exitCode, on.stderr).toBe(0);
      expect(on.stdout).toMatch(/on, [0-9a-f-]{36}/u);
      const mintedId = (await readIdentityFile(fakeHome)) ?? "";
      const personId = (JSON.parse(mintedId) as { person_id: string }).person_id;
      expect(personId).toMatch(UUID_V4);

      const name = await runCli(
        ["telemetry", "identity", "use", "--name", "Baptiste"],
        projectDir,
        fakeHome
      );
      expect(name.exitCode, name.stderr).toBe(0);

      const status = await runCli(["telemetry", "identity"], projectDir, fakeHome);
      expect(status.exitCode, status.stderr).toBe(0);
      expect(status.stdout).toContain(personId);
      expect(status.stdout).toContain('"Baptiste"');

      const finalOff = await runCli(["telemetry", "identity", "off"], projectDir, fakeHome);
      expect(finalOff.exitCode, finalOff.stderr).toBe(0);
      expect(finalOff.stdout).toMatch(/new records/iu);
      expect(await readIdentityFile(fakeHome)).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("a minted identity discloses what it attaches to, and what it never attaches to", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-disclosure-on");
    try {
      const result = await runCli(["telemetry", "identity", "use"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain("Attaches to: records this machine reads locally");
      expect(result.stdout).toContain("Never attaches to:");
      expect(result.stdout).toContain("the run journal");
      expect(result.stdout).toContain("a session already recorded");
      expect(result.stdout).toContain("a tool's own export");
    } finally {
      await cleanup();
    }
  });

  it("off says past records keep the identifier they were written with", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-disclosure-off");
    try {
      await runCli(["telemetry", "identity", "use"], projectDir, fakeHome);

      const result = await runCli(["telemetry", "identity", "off"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      // Withdrawing must never read as erasing what was already measured under the name.
      expect(result.stdout).toContain("Records already stored keep the identifier");
      expect(result.stdout).toContain("none are changed");
    } finally {
      await cleanup();
    }
  });

  it("a second use reports the same identifier, never a new one", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-double-on");
    try {
      await runCli(["telemetry", "identity", "use"], projectDir, fakeHome);
      const first = (await readIdentityFile(fakeHome)) ?? "";

      const second = await runCli(["telemetry", "identity", "use"], projectDir, fakeHome);

      expect(second.exitCode, second.stderr).toBe(0);
      expect(second.stdout).toContain("already in effect");
      expect(await readIdentityFile(fakeHome)).toBe(first);
    } finally {
      await cleanup();
    }
  });

  it("off removes the whole declaration, stating how many added identifiers went with it", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-off-removes-alsome");
    try {
      await runCli(["telemetry", "identity", "use"], projectDir, fakeHome);
      await runCli(["telemetry", "identity", "link", "a-second-machine"], projectDir, fakeHome);

      const result = await runCli(["telemetry", "identity", "off"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/1 added identifier removed with it/iu);

      const status = await runCli(["telemetry", "identity"], projectDir, fakeHome);
      expect(status.stdout).not.toContain("a-second-machine");
    } finally {
      await cleanup();
    }
  });

  it("mints for a name given before anything stands, rather than refusing", async () => {
    // `use` is the verb that opts in, so a name given with nothing standing is a person
    // saying who they are, not renaming a thing that is not there.
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-name-first");
    try {
      const result = await runCli(
        ["telemetry", "identity", "use", "--name", "Baptiste"],
        projectDir,
        fakeHome
      );

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain("Display name: Baptiste");
      const written = await readIdentityFile(fakeHome);
      expect(written).not.toBeNull();
      expect(JSON.parse(written ?? "{}").display_name).toBe("Baptiste");
      expect(JSON.parse(written ?? "{}").origin).toBe("minted");
    } finally {
      await cleanup();
    }
  });

  it("an unreadable identity file surfaces as an error, never as 'no identity is set'", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-unreadable");
    try {
      await mkdir(identityFileIn(fakeHome), { recursive: true });

      const result = await runCli(["telemetry", "identity"], projectDir, fakeHome);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/could not read/iu);
      expect(result.stderr).not.toMatch(/records carry no person/u);
    } finally {
      await cleanup();
    }
  });

  // Pins the adapter half of `forget()`, out of the use-case tests' reach: with `force: true`
  // on the `rm`, a profile that never had a file still prints the withdrawal message.
  it("off on a profile that never had an identity says there was nothing to withdraw", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-off-absent");
    try {
      const result = await runCli(["telemetry", "identity", "off"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/nothing to withdraw/iu);
      expect(result.stdout).not.toMatch(/removed with it/iu);
    } finally {
      await cleanup();
    }
  });

  // A file naming nobody parses to "nobody chose" while still sitting on disk.
  it("off removes an identity file that exists but names nobody", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-off-nameless");
    try {
      const file = identityFileIn(fakeHome);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, `${JSON.stringify({ person_id: "", origin: "adopted" })}\n`, "utf8");

      const result = await runCli(["telemetry", "identity", "off"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).not.toMatch(/nothing to withdraw/iu);
      expect(await readIdentityFile(fakeHome)).toBeNull();
    } finally {
      await cleanup();
    }
  });

  // `off` is how a person gets out: no state a damaged file can put someone in may be one
  // withdrawing cannot get them out of.
  it("off still withdraws a damaged identity file, and says it was discarded", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-off-damaged");
    try {
      await mkdir(identityFileIn(fakeHome), { recursive: true });

      const result = await runCli(["telemetry", "identity", "off"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/could not be read|could not read/iu);
      expect(result.stdout).toMatch(/discard/iu);
      expect(await readIdentityFile(fakeHome)).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("a repository pointing AIDD_USER_CONFIG_DIR elsewhere never moves an existing identity", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("identity-env-override");
    try {
      await seedIdentity(fakeHome, "the-os-profile-identity");
      const elsewhere = join(tempDir, "repo-pointed-elsewhere");
      await mkdir(elsewhere, { recursive: true });
      await writeFile(
        join(elsewhere, "identity.json"),
        `${JSON.stringify({ person_id: "should-never-be-read" }, null, 2)}\n`
      );

      const result = await runCli(["telemetry", "identity"], projectDir, fakeHome, {
        env: { AIDD_USER_CONFIG_DIR: elsewhere },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain("the-os-profile-identity");
      expect(result.stdout).not.toContain("should-never-be-read");
    } finally {
      await cleanup();
    }
  });

  // The test above seeds both profiles, so an implementation that merely prefers the OS one
  // would pass it too: an empty OS profile beside a populated AIDD_USER_CONFIG_DIR reads off.
  it("an empty OS profile beside a populated AIDD_USER_CONFIG_DIR still reads off", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv(
      "identity-env-override-empty"
    );
    try {
      const elsewhere = join(tempDir, "repo-pointed-elsewhere");
      await mkdir(elsewhere, { recursive: true });
      await writeFile(
        join(elsewhere, "identity.json"),
        `${JSON.stringify({ person_id: "forced-by-the-repo" }, null, 2)}\n`
      );

      const result = await runCli(["telemetry", "identity"], projectDir, fakeHome, {
        env: { AIDD_USER_CONFIG_DIR: elsewhere },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/off/u);
      expect(result.stdout).not.toContain("forced-by-the-repo");
      expect(await readIdentityFile(fakeHome)).toBeNull();
    } finally {
      await cleanup();
    }
  });
});

describe("what a default install actually stores: reading every line it wrote", () => {
  it("carries no person field anywhere, proven from the stored bytes", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-default-install");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await cp(LOCAL_COST_FIXTURES, fakeHome, { recursive: true });
      await seedJournal(
        projectDir,
        CLAUDE_RUN_ID,
        CLAUDE_SESSION,
        "claude",
        "2026-08-05T19:00:00Z",
        "2026-08-05T20:00:00Z"
      );

      const result = await runCli(["telemetry", "read"], projectDir, fakeHome);
      expect(result.exitCode, result.stderr).toBe(0);

      const lines = await storedLines(fakeHome);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).not.toHaveProperty("person_id");
        expect(line).not.toHaveProperty("person_display_name");
      }
    } finally {
      await cleanup();
    }
  });
});

describe("a choice made today does not reach backwards", () => {
  it("records stored before opting in stay unnamed; only later records carry it", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-no-retro");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await cp(LOCAL_COST_FIXTURES, fakeHome, { recursive: true });
      await seedJournal(
        projectDir,
        CLAUDE_RUN_ID,
        CLAUDE_SESSION,
        "claude",
        "2026-08-05T19:00:00Z",
        "2026-08-05T20:00:00Z"
      );

      const firstRead = await runCli(["telemetry", "read"], projectDir, fakeHome);
      expect(firstRead.exitCode, firstRead.stderr).toBe(0);
      const beforeOptIn = await storedLines(fakeHome);
      expect(beforeOptIn.length).toBeGreaterThan(0);
      expect(beforeOptIn.every((line) => !("person_id" in line))).toBe(true);

      const on = await runCli(["telemetry", "identity", "use"], projectDir, fakeHome);
      expect(on.exitCode, on.stderr).toBe(0);
      const personId = (
        JSON.parse((await readIdentityFile(fakeHome)) ?? "{}") as {
          person_id: string;
        }
      ).person_id;

      await seedJournal(
        projectDir,
        CODEX_RUN_ID,
        CODEX_SESSION,
        "codex",
        "2026-07-29T15:10:00Z",
        "2026-07-29T15:30:00Z"
      );
      const secondRead = await runCli(["telemetry", "read"], projectDir, fakeHome);
      expect(secondRead.exitCode, secondRead.stderr).toBe(0);
      const afterOptIn = await storedLines(fakeHome);

      const claudeLines = afterOptIn.filter((line) => line.vendor_id === CLAUDE_SESSION);
      const codexLines = afterOptIn.filter((line) => line.vendor_id === CODEX_SESSION);
      expect(claudeLines.length).toBeGreaterThan(0);
      expect(codexLines.length).toBeGreaterThan(0);
      expect(claudeLines.every((line) => !("person_id" in line))).toBe(true);
      expect(codexLines.every((line) => line.person_id === personId)).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

// The one claim nothing else in this file owns: the exact on-disk byte format, and the
// file and directory modes.
describe("the on-disk format the deleted script produced", () => {
  it("name: matches the exact bytes the script wrote from the same starting identity", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-format-name");
    try {
      await seedIdentity(fakeHome, "shared-person-id");

      const result = await runCli(
        ["telemetry", "identity", "use", "--name", "Baptiste"],
        projectDir,
        fakeHome
      );

      expect(result.exitCode, result.stderr).toBe(0);
      const file = await readFile(identityFileIn(fakeHome), "utf8");
      // `seedIdentity` writes the no-`origin` shape; reading it back defaults `origin` to
      // `"minted"`, and every write from here on carries it.
      expect(file).toBe(
        '{\n  "person_id": "shared-person-id",\n  "origin": "minted",\n  "display_name": "Baptiste"\n}\n'
      );
    } finally {
      await cleanup();
    }
  });

  it("use with no identifier: from empty, mints a v4 identifier recording how it was obtained", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-format-on-empty");
    try {
      const result = await runCli(["telemetry", "identity", "use"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      const file = await readFile(identityFileIn(fakeHome), "utf8");
      const personId = (JSON.parse(file) as { person_id: string }).person_id;
      expect(personId).toMatch(UUID_V4);
      // `mint()` records `origin: "minted"`: how an identity was obtained is knowable only at
      // the moment it is created.
      expect(file.replace(personId, "<uuid>")).toBe(
        '{\n  "person_id": "<uuid>",\n  "origin": "minted"\n}\n'
      );

      if (process.platform !== "win32") {
        expect((await stat(identityFileIn(fakeHome))).mode & 0o777).toBe(0o600);
        expect((await stat(dirname(identityFileIn(fakeHome)))).mode & 0o777).toBe(0o700);
      }
    } finally {
      await cleanup();
    }
  });
});

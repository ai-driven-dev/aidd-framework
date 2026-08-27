import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, gitInit, identityFileIn, runCli } from "./helpers.js";

/**
 * `aidd telemetry identity` — the CLI's own mint/name/forget of the person identifier that
 * `aidd telemetry read` may stamp onto a record. Three concerns, three describe blocks:
 * the journey and its edge cases (phase-2.md's own Test Scope), the two suites phase 1
 * moved out of the plugin's own test file once its reporter was deleted, and the on-disk
 * format the deleted script pinned — phase 3 deletes `telemetry-identity.cjs` itself, so
 * this is captured as a fixture rather than a live comparison. See `measurements.md`'s
 * "Phase 3" section for what each of the six former parity tests became.
 */
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

async function storedLines(fakeHome: string): Promise<Record<string, unknown>[]> {
  const dir = join(fakeHome, ".config", "aidd", "telemetry");
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
  it("walks status -> on -> name -> status -> off, each state legible from stdout", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-journey");
    try {
      const off = await runCli(["telemetry", "identity", "status"], projectDir, fakeHome);
      expect(off.exitCode, off.stderr).toBe(0);
      expect(off.stdout).toContain("off");
      expect(off.stdout).not.toContain("on,");

      const on = await runCli(["telemetry", "identity", "on"], projectDir, fakeHome);
      expect(on.exitCode, on.stderr).toBe(0);
      expect(on.stdout).toMatch(/on, [0-9a-f-]{36}/u);
      const mintedId = (await readIdentityFile(fakeHome)) ?? "";
      const personId = (JSON.parse(mintedId) as { person_id: string }).person_id;
      expect(personId).toMatch(UUID_V4);

      const name = await runCli(
        ["telemetry", "identity", "name", "Baptiste"],
        projectDir,
        fakeHome
      );
      expect(name.exitCode, name.stderr).toBe(0);

      const status = await runCli(["telemetry", "identity", "status"], projectDir, fakeHome);
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

  // These four lines are what a person reads before deciding, and what 04-identify.md and
  // 05-forget.md require the skill to relay. Nothing held them: all four could be deleted
  // from telemetry-display.ts and the suite stayed green. In a feature whose whole value is
  // that consent is explicit, the consent text is the last thing that should be unguarded.
  it("on discloses what an identity attaches to, and what it never attaches to", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-disclosure-on");
    try {
      const result = await runCli(["telemetry", "identity", "on"], projectDir, fakeHome);

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
      await runCli(["telemetry", "identity", "on"], projectDir, fakeHome);

      const result = await runCli(["telemetry", "identity", "off"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      // Withdrawing must never read as erasing what was already measured under the name.
      expect(result.stdout).toContain("Records already stored keep the identifier");
      expect(result.stdout).toContain("none are changed");
    } finally {
      await cleanup();
    }
  });

  it("a second on reports the same identifier, never a new one", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-double-on");
    try {
      await runCli(["telemetry", "identity", "on"], projectDir, fakeHome);
      const first = (await readIdentityFile(fakeHome)) ?? "";

      const second = await runCli(["telemetry", "identity", "on"], projectDir, fakeHome);

      expect(second.exitCode, second.stderr).toBe(0);
      expect(second.stdout).toContain("already on");
      expect(await readIdentityFile(fakeHome)).toBe(first);
    } finally {
      await cleanup();
    }
  });

  it("naming before opting in refuses and names on as the missing step", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-name-first");
    try {
      const result = await runCli(
        ["telemetry", "identity", "name", "Baptiste"],
        projectDir,
        fakeHome
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/telemetry identity on/u);
      expect(await readIdentityFile(fakeHome)).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("an unreadable identity file surfaces as an error, never as 'no identity is set'", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-unreadable");
    try {
      await mkdir(identityFileIn(fakeHome), { recursive: true });

      const result = await runCli(["telemetry", "identity", "status"], projectDir, fakeHome);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/could not read/iu);
      expect(result.stderr).not.toMatch(/records carry no person/u);
    } finally {
      await cleanup();
    }
  });

  // `status`, `on` and `name` are right to error on a damaged file — the edge case above.
  // `off` is not: it is how a person gets out, and there must be no state a damaged file
  // can put someone in that withdrawing cannot get them out of.
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

      const result = await runCli(["telemetry", "identity", "status"], projectDir, fakeHome, {
        env: { AIDD_USER_CONFIG_DIR: elsewhere },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain("the-os-profile-identity");
      expect(result.stdout).not.toContain("should-never-be-read");
    } finally {
      await cleanup();
    }
  });

  // The test above seeds both the OS profile and the decoy, so an implementation that
  // merely *prefers* the OS profile when both exist — falling back to
  // AIDD_USER_CONFIG_DIR only when the profile is empty — would still pass it. This is
  // the shape the deleted script suite actually asserted ("the choice belongs to the
  // person, not the repository"): an empty OS profile beside a populated
  // AIDD_USER_CONFIG_DIR must still read as no identity, never as the decoy's.
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

      const result = await runCli(["telemetry", "identity", "status"], projectDir, fakeHome, {
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

      const on = await runCli(["telemetry", "identity", "on"], projectDir, fakeHome);
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

// What `telemetry-identity.cjs` wrote to disk, captured 2026-08-26 — the run that produced
// each literal below is recorded in measurements.md's "Phase 3" section, before the script
// was deleted in this same phase. `off`, `status` (both states) and `on` against an
// existing identity are already asserted by the journey block above through the CLI alone;
// re-running them against the script here would be the duplication plan.md's own Decision
// forbids ("one equivalence pin, not a suite watching two implementations agree with
// themselves"). What survives is the one claim nothing else in this file owns: the exact
// on-disk byte format, and the file/directory modes.
describe("the on-disk format the deleted script produced", () => {
  it("name: matches the exact bytes the script wrote from the same starting identity", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-format-name");
    try {
      await seedIdentity(fakeHome, "shared-person-id");

      const result = await runCli(
        ["telemetry", "identity", "name", "Baptiste"],
        projectDir,
        fakeHome
      );

      expect(result.exitCode, result.stderr).toBe(0);
      const file = await readFile(identityFileIn(fakeHome), "utf8");
      // Captured from `telemetry-identity.cjs name Baptiste` against this exact starting
      // state, 2026-08-26, before the script was deleted — a literal, not a re-derivation
      // sharing the adapter's own `JSON.stringify(_, null, 2)` call.
      expect(file).toBe('{\n  "person_id": "shared-person-id",\n  "display_name": "Baptiste"\n}\n');
    } finally {
      await cleanup();
    }
  });

  it("on: from empty, mints a v4 identifier in the script's own on-disk shape and modes", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("identity-format-on-empty");
    try {
      const result = await runCli(["telemetry", "identity", "on"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      const file = await readFile(identityFileIn(fakeHome), "utf8");
      const personId = (JSON.parse(file) as { person_id: string }).person_id;
      expect(personId).toMatch(UUID_V4);
      // Captured from `telemetry-identity.cjs on` against an empty profile, 2026-08-26,
      // before the script was deleted — a literal, with the script's own random uuid
      // normalized to a placeholder so the shape is comparable across runs.
      expect(file.replace(personId, "<uuid>")).toBe('{\n  "person_id": "<uuid>"\n}\n');

      if (process.platform !== "win32") {
        expect((await stat(identityFileIn(fakeHome))).mode & 0o777).toBe(0o600);
        expect((await stat(dirname(identityFileIn(fakeHome)))).mode & 0o777).toBe(0o700);
      }
    } finally {
      await cleanup();
    }
  });
});

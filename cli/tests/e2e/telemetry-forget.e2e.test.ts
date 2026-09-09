import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/runtime/git/git-environment.js";
import { createTestEnv, gitInit, identityFileIn, runCli, sinkDirIn } from "./helpers.js";

const execFileAsync = promisify(execFile);

const RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const VENDOR_ID = "vendorabc";
const JOURNAL_FILE = `${RUN_ID}__${VENDOR_ID}.jsonl`;

async function git(args: readonly string[], cwd: string): Promise<{ stdout: string }> {
  return execFileAsync("git", [...args], { cwd, env: environmentWithoutGitVariables(process.env) });
}

async function seedJournal(projectDir: string): Promise<string> {
  const runsDir = join(projectDir, "aidd_docs", "runs");
  await mkdir(runsDir, { recursive: true });
  const line = (value: unknown) => `${JSON.stringify(value)}\n`;
  await writeFile(
    join(runsDir, JOURNAL_FILE),
    line({
      type: "session_start",
      at: "2026-08-20T10:00:00.000Z",
      run_id: RUN_ID,
      tool: "claude-code",
      vendor_id: VENDOR_ID,
      project_id: "acme-widgets",
    }) + line({ type: "turn_end", at: "2026-08-20T10:05:00.000Z" })
  );
  return join(runsDir, JOURNAL_FILE);
}

async function seedSinkDayFile(
  fakeHome: string,
  dayFile: string,
  content: string
): Promise<string> {
  const dir = sinkDirIn(fakeHome);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, dayFile);
  await writeFile(filePath, content);
  return filePath;
}

function sinkRecordLine(vendorId: string): string {
  return `${JSON.stringify({
    sink_schema_version: 2,
    kind: "request",
    provenance: "export",
    tool: "claude",
    vendor_id: vendorId,
    vendor_field: "session.id",
    cost_usd: 1,
    step_attribution: "unattributed",
  })}\n`;
}

async function seedIdentity(fakeHome: string, personId: string): Promise<string> {
  const filePath = identityFileIn(fakeHome);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ person_id: personId, origin: "minted" })}\n`);
  return filePath;
}

async function writeSwitch(projectDir: string, enabled: boolean): Promise<void> {
  await mkdir(join(projectDir, ".aidd"), { recursive: true });
  await writeFile(
    join(projectDir, ".aidd", "config.json"),
    JSON.stringify({ telemetry: { enabled } })
  );
}

async function readSwitch(projectDir: string): Promise<string> {
  return readFile(join(projectDir, ".aidd", "config.json"), "utf8");
}

async function entries(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

describe("aidd telemetry forget — shows, confirms, removes, and names what history keeps", () => {
  it("a machine where nothing was ever measured has nothing to remove, and offers nothing", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("forget-empty");
    try {
      await gitInit(projectDir);

      const result = await runCli(["telemetry", "forget"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/nothing was ever measured/u);
      expect(result.stdout).not.toMatch(/Pass --yes/u);
    } finally {
      await cleanup();
    }
  });

  it("previews an untracked journal as history possibly holding it, never as an all-clear", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("forget-untracked-preview");
    try {
      await gitInit(projectDir);
      await seedJournal(projectDir);
      await seedSinkDayFile(fakeHome, "2026-08-20.jsonl", sinkRecordLine("s-1"));
      await seedIdentity(fakeHome, "11111111-1111-1111-1111-111111111111");

      const result = await runCli(["telemetry", "forget"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/This project's run journal/u);
      expect(result.stdout).toMatch(/1 run file/u);
      expect(result.stdout).toMatch(/This machine's stored records — every project/u);
      expect(result.stdout).toMatch(/1 day file/u);
      expect(result.stderr).toMatch(/may still hold it if it was ever committed before/u);
      expect(result.stderr).not.toMatch(/certainly holds it/u);
    } finally {
      await cleanup();
    }
  });

  it("previews a tracked journal as history certainly holding it, naming the file", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("forget-tracked-preview");
    try {
      await gitInit(projectDir);
      await seedJournal(projectDir);
      const trackedRelative = `aidd_docs/runs/${JOURNAL_FILE}`;
      await git(["add", trackedRelative], projectDir);
      await git(
        [
          "-c",
          "user.email=t@t.com",
          "-c",
          "user.name=t",
          "commit",
          "-q",
          "-m",
          "committed by hand",
        ],
        projectDir
      );

      const result = await runCli(["telemetry", "forget"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).toMatch(/certainly holds it/u);
      expect(result.stderr).toContain(trackedRelative);
      expect(result.stderr).toMatch(/does not remove it from history/u);
    } finally {
      await cleanup();
    }
  });

  // `git ls-files` reads the index, not history: a staged journal in a repository with no
  // commits is not held by history at all.
  it("previews a staged-but-never-committed journal honestly, never as certainly held", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("forget-staged-preview");
    try {
      await gitInit(projectDir);
      await seedJournal(projectDir);
      const trackedRelative = `aidd_docs/runs/${JOURNAL_FILE}`;
      await git(["add", trackedRelative], projectDir);
      // Deliberately no commit — this repository has zero commits at all.

      const result = await runCli(["telemetry", "forget"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).not.toMatch(/certainly holds it/u);
      expect(result.stderr).toMatch(/has never been committed/u);
      expect(result.stderr).toContain(trackedRelative);
    } finally {
      await cleanup();
    }
  });

  it("a relocated AIDD_RUNS_DIR touches only the relocated location, never the project's own runs dir", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("forget-runs-relocated");
    try {
      await gitInit(projectDir);
      const realJournalPath = await seedJournal(projectDir);

      const relocated = join(fakeHome, "relocated-runs");
      await mkdir(relocated, { recursive: true });
      await writeFile(join(relocated, JOURNAL_FILE), "relocated content\n");

      const result = await runCli(["telemetry", "forget", "--yes"], projectDir, fakeHome, {
        env: { AIDD_RUNS_DIR: relocated },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain(relocated);
      expect(await entries(relocated)).toEqual([]);
      expect(await readFile(realJournalPath, "utf8")).toContain(VENDOR_ID);
    } finally {
      await cleanup();
    }
  });

  // A directory named `*.jsonl` refuses removal portably — `EISDIR` on POSIX,
  // access-denied-shaped on Windows — with no `chmod` needed.
  it("a run file that refuses removal (a directory named *.jsonl) is reported, and the rest is still removed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("forget-refused-real");
    try {
      await gitInit(projectDir);
      const runsDir = join(projectDir, "aidd_docs", "runs");
      await mkdir(join(runsDir, "adir.jsonl"), { recursive: true });
      await seedSinkDayFile(fakeHome, "2026-08-20.jsonl", sinkRecordLine("s-1"));
      await seedIdentity(fakeHome, "11111111-1111-1111-1111-111111111111");

      const result = await runCli(["telemetry", "forget", "--yes"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(
        /This project's run journal: 0 removed, 1 could not be removed/u
      );
      expect(result.stderr).toMatch(/Could not remove journal run file adir\.jsonl/u);
      expect(await entries(runsDir)).toEqual(["adir.jsonl"]);
      expect(result.stdout).toMatch(/This machine's stored records: 1 removed/u);
      expect(result.stdout).toMatch(/This machine's identity: 1 removed/u);
      expect(await entries(sinkDirIn(fakeHome))).toEqual([]);
      await expect(readFile(identityFileIn(fakeHome), "utf8")).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it("without --yes, refuses: nothing removed, and it says so plainly, exiting successfully", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("forget-refused");
    try {
      await gitInit(projectDir);
      const journalPath = await seedJournal(projectDir);
      const sinkPath = await seedSinkDayFile(fakeHome, "2026-08-20.jsonl", sinkRecordLine("s-1"));
      const identityPath = await seedIdentity(fakeHome, "11111111-1111-1111-1111-111111111111");

      const result = await runCli(["telemetry", "forget"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/Nothing removed\. Pass --yes/u);
      expect(await readFile(journalPath, "utf8")).toContain(VENDOR_ID);
      expect(await readFile(sinkPath, "utf8")).toContain("s-1");
      expect(await readFile(identityPath, "utf8")).toContain("11111111");
    } finally {
      await cleanup();
    }
  });

  it("with --yes, removes exactly what was shown, in counts that match, and leaves the switch alone", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("forget-confirmed");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await seedJournal(projectDir);
      await seedSinkDayFile(fakeHome, "2026-08-19.jsonl", sinkRecordLine("s-1"));
      await seedSinkDayFile(fakeHome, "2026-08-20.jsonl", sinkRecordLine("s-2"));
      await seedIdentity(fakeHome, "11111111-1111-1111-1111-111111111111");

      const preview = await runCli(["telemetry", "forget"], projectDir, fakeHome);
      expect(preview.stdout).toMatch(/1 run file/u);
      expect(preview.stdout).toMatch(/2 day file/u);

      const result = await runCli(["telemetry", "forget", "--yes"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/This project's run journal: 1 removed/u);
      expect(result.stdout).toMatch(/This machine's stored records: 2 removed/u);
      expect(result.stdout).toMatch(/This machine's identity: 1 removed/u);
      expect(await entries(join(projectDir, "aidd_docs", "runs"))).toEqual([]);
      expect(await entries(sinkDirIn(fakeHome))).toEqual([]);
      await expect(readFile(identityFileIn(fakeHome), "utf8")).rejects.toThrow();

      expect(JSON.parse(await readSwitch(projectDir))).toEqual({ telemetry: { enabled: true } });
      const onAgain = await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);
      expect(onAgain.exitCode, onAgain.stderr).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it("history is repeated after removing, not only before", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("forget-history-after");
    try {
      await gitInit(projectDir);
      await seedJournal(projectDir);
      const trackedRelative = `aidd_docs/runs/${JOURNAL_FILE}`;
      await git(["add", trackedRelative], projectDir);
      await git(
        [
          "-c",
          "user.email=t@t.com",
          "-c",
          "user.name=t",
          "commit",
          "-q",
          "-m",
          "committed by hand",
        ],
        projectDir
      );

      const result = await runCli(["telemetry", "forget", "--yes"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).toMatch(/certainly holds it/u);
      expect(result.stderr).toContain(trackedRelative);
    } finally {
      await cleanup();
    }
  });

  it("a damaged record file is removed and reported as removed, exactly like any other", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("forget-damaged");
    try {
      await gitInit(projectDir);
      await seedSinkDayFile(fakeHome, "2026-08-20.jsonl", "not json at all {{{\n");

      const result = await runCli(["telemetry", "forget", "--yes"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/This machine's stored records: 1 removed/u);
      expect(await entries(sinkDirIn(fakeHome))).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("a relocated AIDD_USER_CONFIG_DIR touches only the relocated location, never the real profile", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("forget-relocated");
    try {
      await gitInit(projectDir);
      // A record under the ordinary profile, which the relocated run must never reach.
      const realSinkPath = await seedSinkDayFile(
        fakeHome,
        "2026-08-18.jsonl",
        sinkRecordLine("real")
      );

      const relocated = join(fakeHome, "relocated-config");
      await mkdir(join(relocated, "telemetry"), { recursive: true });
      await writeFile(
        join(relocated, "telemetry", "2026-08-17.jsonl"),
        sinkRecordLine("relocated")
      );

      const result = await runCli(["telemetry", "forget", "--yes"], projectDir, fakeHome, {
        env: { AIDD_USER_CONFIG_DIR: relocated },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain(relocated);
      expect(await entries(join(relocated, "telemetry"))).toEqual([]);
      expect(await readFile(realSinkPath, "utf8")).toContain("real");
    } finally {
      await cleanup();
    }
  });
});

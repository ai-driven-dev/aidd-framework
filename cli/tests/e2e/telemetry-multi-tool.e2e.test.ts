import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { chmod, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

/**
 * Three readable tools through one report, from the files each of them actually writes.
 *
 * Everything here is a real capture. The Claude Code transcript and the Codex rollout come
 * from `tests/fixtures/local-cost`; the hook payloads come from `scripts/__tests__/fixtures`
 * and are replayed through the journal hook itself, so the writer is exercised rather than
 * imitated. OpenCode is served by a stand-in `opencode` on the path answering with the
 * captured export payload — the reader shells out, and an e2e must not depend on whether
 * the machine running it happens to have that tool installed.
 */
const REPO_ROOT = resolve(process.cwd(), "..");
const LOCAL_COST_FIXTURES = join(process.cwd(), "tests", "fixtures", "local-cost");
const HOOK_FIXTURES = join(REPO_ROOT, "scripts", "__tests__", "fixtures");
const JOURNAL_HOOK = join(REPO_ROOT, "plugins", "aidd-telemetry", "hooks", "journal.js");
const OPENCODE_EXPORT_FIXTURE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "telemetry-sink",
  "opencode-export.json"
);

const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";
const CODEX_SESSION = "019fae6f-2009-7cd3-86b2-b8f83481b160";
const OPENCODE_SESSION = "ses_probe000000000000000000000";

// The day each tool's captured work happened. They are months apart, which is the point:
// one period has to reach all three, and each record has to land on its own day.
const OLDEST_WORK_DAY = "2026-03-16";
const TASK = "2026_08/2026_08_21_probe-task";
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// A run id is a ULID, and the journal splits a run file's name on that fixed length.
const CODEX_RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FBW";

async function loadHookFixture(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(HOOK_FIXTURES, `${name}.json`), "utf8"));
}

describe("aidd telemetry, across every tool that can be read", () => {
  let projectDir: string;
  let fakeHome: string;
  let binDir: string;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const env = await createTestEnv("telemetry-multi-tool");
    cleanup = env.cleanup;
    // git resolves symlinks in --show-toplevel and macOS puts tmpdir behind one; the hook
    // compares the two, and would reject every written path if they disagreed.
    projectDir = realpathSync(env.projectDir);
    fakeHome = realpathSync(env.fakeHome);
    binDir = join(fakeHome, "bin");
    await gitInit(projectDir);
    await writeConfig();
    await cp(LOCAL_COST_FIXTURES, fakeHome, { recursive: true });
    await installOpencodeStandIn();
  });

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function writeConfig(): Promise<void> {
    await mkdir(join(projectDir, ".aidd"), { recursive: true });
    await writeFile(
      join(projectDir, ".aidd", "config.json"),
      JSON.stringify({ telemetry: { enabled: true } }),
      "utf-8"
    );
  }

  /** Answers `opencode export <id> --sanitize` with the captured payload, and nothing else
   * with anything. A real binary would make this test depend on the machine it runs on. */
  async function installOpencodeStandIn(): Promise<void> {
    await mkdir(binDir, { recursive: true });
    const standIn = join(binDir, "opencode");
    await writeFile(
      standIn,
      `#!/bin/sh\nif [ "$1" = "export" ]; then cat ${OPENCODE_EXPORT_FIXTURE}; exit 0; fi\nexit 1\n`,
      "utf-8"
    );
    await chmod(standIn, 0o755);
  }

  function cli(args: readonly string[]) {
    // The stand-in first, node's own directory after it, so `node` still resolves.
    return runCli([...args], projectDir, fakeHome, {
      env: { PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}` },
    });
  }

  /** Replays one captured payload through the journal hook, retargeted at this test's
   * repository and session. The hook decides the host from the payload's own shape. */
  function replayHook(payload: Record<string, unknown>, event: string): void {
    execFileSync("node", [JOURNAL_HOOK, event], {
      input: JSON.stringify(payload),
      cwd: projectDir,
      encoding: "utf8",
    });
  }

  async function journalClaudeSession(): Promise<void> {
    const transcript = `${fakeHome}/.claude/projects/fake-project/${CLAUDE_SESSION}.jsonl`;
    const start = await loadHookFixture("claude-code-session-start");
    replayHook(
      { ...start, session_id: CLAUDE_SESSION, transcript_path: transcript, cwd: projectDir },
      "session-start"
    );

    const skill = await loadHookFixture("claude-code-post-tool-use-skill");
    replayHook(
      { ...skill, session_id: CLAUDE_SESSION, transcript_path: transcript, cwd: projectDir },
      "tool-used"
    );

    const write = await loadHookFixture("claude-code-post-tool-use-write");
    const notes = join(
      projectDir,
      "aidd_docs",
      "tasks",
      "2026_08",
      "2026_08_21_probe-task",
      "notes.md"
    );
    await mkdir(join(projectDir, "aidd_docs", "tasks", "2026_08", "2026_08_21_probe-task"), {
      recursive: true,
    });
    await writeFile(notes, "probe\n", "utf-8");
    replayHook(
      {
        ...write,
        session_id: CLAUDE_SESSION,
        transcript_path: transcript,
        cwd: projectDir,
        tool_input: { file_path: notes, content: "probe" },
      },
      "tool-used"
    );
  }

  /** Hand-written, unlike the Claude Code one, and deliberately so: the hook stamps every
   * line with the moment it runs, and the Codex rollout captured here is from July. A step
   * interval that could reach it can only be constructed, never replayed. */
  async function journalCodexSessionBackdated(): Promise<void> {
    const runsDir = join(projectDir, "aidd_docs", "runs");
    await mkdir(runsDir, { recursive: true });
    const lines = [
      {
        type: "session_start",
        at: "2026-07-29T15:10:00Z",
        schema_version: 2,
        run_id: CODEX_RUN_ID,
        project_id: "acme/probe",
        project_remote: null,
        tool: "codex",
        vendor_id: CODEX_SESSION,
        vendor_field: "conversation.id",
      },
      { type: "step_start", at: "2026-07-29T15:11:00Z", skill: "aidd-dev:02-implement" },
      { type: "turn_end", at: "2026-07-29T15:30:00Z" },
    ];
    await writeFile(
      join(runsDir, `${CODEX_RUN_ID}__${CODEX_SESSION}.jsonl`),
      `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
      "utf-8"
    );
  }

  async function readEveryTool(): Promise<void> {
    for (const session of [CLAUDE_SESSION, CODEX_SESSION, OPENCODE_SESSION]) {
      const result = await cli(["telemetry", "read", "--session", session]);
      expect(result.exitCode, `reading ${session}: ${result.stderr}`).toBe(0);
    }
  }

  function daysBackToTheOldestWork(): string {
    const elapsed = Date.now() - Date.parse(`${OLDEST_WORK_DAY}T00:00:00Z`);
    return String(Math.ceil(elapsed / MILLISECONDS_PER_DAY));
  }

  async function reportEverything(): Promise<string> {
    const result = await cli(["telemetry", "report", "--days", daysBackToTheOldestWork()]);
    expect(result.exitCode, result.stderr).toBe(0);
    return result.stdout;
  }

  it("reads three tools' own files and reports all three in one period", async () => {
    await journalClaudeSession();
    await journalCodexSessionBackdated();
    await readEveryTool();

    const out = await reportEverything();

    // Every tool reports tokens and none reports an amount: no tool's own files carry a
    // dollar figure, on any reader wired today. Claude Code's cost reaches the sink only
    // through its OTLP export, which this path does not use. A zero here would read as
    // free, so the report says the amount is unknown for all three.
    expect(out).toMatch(/Claude Code\s+amount unknown/u);
    expect(out).toMatch(/Codex\s+amount unknown/u);
    expect(out).toMatch(/OpenCode\s+amount unknown/u);
    expect(out).not.toContain("$");
    // Codex's two turns, recomputed by hand from the rollout's own increments.
    expect(out).toContain("183,939");
    // The three tools' figures stay their own rather than being pooled.
    expect(out).toMatch(/OpenCode\s+amount unknown\s+435,855 tokens/u);
    expect(out).toMatch(/Claude Code\s+amount unknown\s+151,826 tokens/u);
  });

  it("names the one tool nothing here can read, with its measured reason", async () => {
    const out = await reportEverything();

    expect(out).toMatch(/Cursor\s+not covered — It writes no token count/u);
    // Copilot is covered (#697), but no session of its own was journalled in this test -
    // reading as "nothing in this period" is the correct answer, never "not covered".
    expect(out).toMatch(/GitHub Copilot\s+nothing in this period/u);
    expect(out).not.toMatch(/GitHub Copilot\s+not covered/u);
  });

  it("shows all three attribution strengths at once, each from its own source", async () => {
    await journalClaudeSession();
    await journalCodexSessionBackdated();
    await readEveryTool();

    const out = await reportEverything();
    const mix = out.slice(out.indexOf("attribution "));

    // Claude Code's subagent transcript states its own skill, on the line with the counters.
    expect(out).toContain("probe-echo");
    expect(mix).toContain("stated by the tool");
    // Codex states none, so its records fall inside the journal's step interval instead.
    expect(out).toContain("aidd-dev:02-implement");
    expect(mix).toContain("from a journal interval");
    // OpenCode has no journal beside it and states nothing.
    expect(mix).toContain("unattributed");
  });

  it("attributes a task from what the journal hook itself recorded", async () => {
    await journalClaudeSession();
    await journalCodexSessionBackdated();
    await readEveryTool();

    const runFiles = await readdir(join(projectDir, "aidd_docs", "runs"));
    const claudeRun = runFiles.find((name) => name.endsWith(`__${CLAUDE_SESSION}.jsonl`));
    const journal = await readFile(join(projectDir, "aidd_docs", "runs", claudeRun ?? ""), "utf8");
    expect(journal).toContain('"file_written"');

    const result = await cli([
      "telemetry",
      "report",
      "--days",
      daysBackToTheOldestWork(),
      "--task",
      TASK,
    ]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain(`task ${TASK}`);
    // Only Claude Code wrote into that folder; Codex's figures must not follow it there.
    // "in this selection", not "in this period": --task narrows the record set before any
    // breakdown runs, so Codex's zero here is the task filter's doing, not real idleness.
    expect(result.stdout).not.toContain("183,939");
    expect(result.stdout).toMatch(/Codex\s+nothing in this selection/u);
  });

  // #686. The Claude Code transcript this reads carries a captured `<synthetic>` line —
  // a notice the tool composed itself, not a call anyone was billed for. It used to reach
  // the sink and sit in this breakdown beside the real models, as though it were one.
  it("breaks a real session down by model and lists only models", async () => {
    await journalClaudeSession();
    await journalCodexSessionBackdated();
    await readEveryTool();

    const result = await cli([
      "telemetry",
      "report",
      "--days",
      daysBackToTheOldestWork(),
      "--json",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    const parsed = JSON.parse(result.stdout) as { by_model: readonly { model?: string }[] };
    const models = parsed.by_model.map((row) => row.model);

    expect(models.length).toBeGreaterThan(0);
    expect(models).not.toContain("<synthetic>");
    for (const model of models) expect(model).not.toMatch(/^</u);
  });

  it("stores nothing twice when the same sessions are read again", async () => {
    await journalClaudeSession();
    await journalCodexSessionBackdated();
    await readEveryTool();
    const first = await reportEverything();

    await readEveryTool();
    const second = await reportEverything();

    expect(second).toBe(first);
  });
});

describe("the flow a person can actually follow", () => {
  let projectDir: string;
  let fakeHome: string;
  let binDir: string;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const env = await createTestEnv("telemetry-flow");
    cleanup = env.cleanup;
    projectDir = realpathSync(env.projectDir);
    fakeHome = realpathSync(env.fakeHome);
    binDir = join(fakeHome, "bin");
    await gitInit(projectDir);
    await mkdir(join(projectDir, ".aidd"), { recursive: true });
    await writeFile(
      join(projectDir, ".aidd", "config.json"),
      JSON.stringify({ telemetry: { enabled: true } }),
      "utf-8"
    );
    await cp(LOCAL_COST_FIXTURES, fakeHome, { recursive: true });
    await mkdir(binDir, { recursive: true });
    await writeFile(join(binDir, "opencode"), "#!/bin/sh\nexit 1\n", "utf-8");
    await chmod(join(binDir, "opencode"), 0o755);
  });

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  function cli(args: readonly string[]) {
    return runCli([...args], projectDir, fakeHome, {
      env: { PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}` },
    });
  }

  async function journalCodex(): Promise<void> {
    const runsDir = join(projectDir, "aidd_docs", "runs");
    await mkdir(runsDir, { recursive: true });
    await writeFile(
      join(runsDir, `${CODEX_RUN_ID}__${CODEX_SESSION}.jsonl`),
      `${JSON.stringify({
        type: "session_start",
        at: "2026-07-29T15:10:00Z",
        schema_version: 2,
        run_id: CODEX_RUN_ID,
        tool: "codex",
        vendor_id: CODEX_SESSION,
      })}\n`,
      "utf-8"
    );
  }

  it("reads every journalled session without anyone naming one", async () => {
    await journalCodex();

    const read = await cli(["telemetry", "read"]);

    expect(read.exitCode, read.stderr).toBe(0);
    expect(read.stdout).toContain("1 session read");
    const report = await cli(["telemetry", "report", "--from", "2026-07-01", "--to", "2026-07-31"]);
    expect(report.stdout).toContain("183,939");
  });

  it("says so, and exits 0, when nothing has been journalled yet", async () => {
    const read = await cli(["telemetry", "read"]);

    expect(read.exitCode).toBe(0);
    expect(read.stdout).toContain("No session journalled yet");
  });

  it("answers a program with the same object twice, for the same absolute period", async () => {
    await journalCodex();
    await cli(["telemetry", "read"]);

    const first = await cli([
      "telemetry",
      "report",
      "--from",
      "2026-07-01",
      "--to",
      "2026-07-31",
      "--json",
    ]);
    const second = await cli([
      "telemetry",
      "report",
      "--from",
      "2026-07-01",
      "--to",
      "2026-07-31",
      "--json",
    ]);

    expect(first.exitCode, first.stderr).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    const parsed = JSON.parse(first.stdout);
    expect(parsed.cost_report_version).toBe(2);
    expect(parsed.period).toEqual({ from_day: "2026-07-01", to_day: "2026-07-31" });
    expect(parsed.attribution.map((row: { attribution: string }) => row.attribution)).toEqual([
      "tool-stated",
      "journal-interval",
      "unattributed",
    ]);
  });

  it("tells a program what each tool can supply, so it never infers it from a missing number", async () => {
    const parsed = JSON.parse((await cli(["telemetry", "report", "--json"])).stdout) as {
      by_tool: readonly { tool: string; capability: Record<string, unknown> }[];
    };
    const capability = Object.fromEntries(parsed.by_tool.map((row) => [row.tool, row.capability]));

    // No locally-read tool carries an amount, and a consumer reads that here rather than
    // concluding it from a report that happens to show none.
    expect(capability.codex).toMatchObject({
      local_read: { token_counters: true, amount: false, tool_stated_step: false },
      task_attributable: true,
    });
    expect(capability.cursor).toMatchObject({ local_read: null, task_attributable: true });
    expect(capability.claude).toMatchObject({ task_attributable: true });
  });

  it("refuses a period that is not one, naming the flag", async () => {
    const result = await cli(["telemetry", "report", "--from", "notaday"]);

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("--from");
    expect(`${result.stdout}${result.stderr}`).not.toContain("toISOString");
  });
});

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/runtime/git/git-environment.js";
import { copyFixtureTree, pathWithoutAidd, runCli } from "./helpers.js";

const REPO_ROOT = resolve(process.cwd(), "..");
const JOURNAL_HOOK = join(REPO_ROOT, "plugins", "aidd-telemetry", "hooks", "journal.cjs");
const LOCAL_COST_FIXTURES = join(process.cwd(), "tests", "fixtures", "local-cost");
const HOOK_FIXTURES = join(REPO_ROOT, "scripts", "__tests__", "fixtures");

const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";
const TASK = "2026_08/2026_08_21_probe-task";
/** Every token the captured Claude Code session billed, the same figure
 * `telemetry-lifecycle.e2e.test.ts` pins from the identical fixture and hook sequence. */
const SESSION_TOKENS = "151,826";

describe("the plugin measures on its own", () => {
  let projectDir: string;
  let fakeHome: string;
  let configDir: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = realpathSync(await mkdtemp(join(tmpdir(), "aidd-standalone-")));
    projectDir = join(tempDir, "project");
    fakeHome = join(tempDir, "home");
    configDir = join(tempDir, "config");
    await mkdir(projectDir, { recursive: true });
    await mkdir(fakeHome, { recursive: true });
    execFileSync("git", ["init", "-q", projectDir], {
      env: environmentWithoutGitVariables(process.env),
    });
    // The tools' own files, exactly as a machine that ran them would hold.
    await copyFixtureTree(LOCAL_COST_FIXTURES, fakeHome);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function env(): NodeJS.ProcessEnv {
    return {
      ...environmentWithoutGitVariables(process.env),
      PATH: pathWithoutAidd(),
      HOME: fakeHome,
      AIDD_USER_CONFIG_DIR: configDir,
    };
  }

  /** The switch is seeded by writing the file, never through `aidd telemetry on`: the claim
   * here is that the hooks record with no CLI on the `PATH` this section strips. */
  async function enableTelemetry(): Promise<void> {
    await mkdir(join(projectDir, ".aidd"), { recursive: true });
    await writeFile(
      join(projectDir, ".aidd", "config.json"),
      JSON.stringify({ telemetry: { enabled: true } }),
      "utf-8"
    );
  }

  async function replayHook(fixture: string, event: string, extra: object): Promise<void> {
    const payload = JSON.parse(await readFile(join(HOOK_FIXTURES, `${fixture}.json`), "utf8"));
    execFileSync(process.execPath, [JOURNAL_HOOK, event], {
      input: JSON.stringify({
        ...payload,
        session_id: CLAUDE_SESSION,
        transcript_path: join(
          fakeHome,
          ".claude",
          "projects",
          "fake-project",
          `${CLAUDE_SESSION}.jsonl`
        ),
        cwd: projectDir,
        ...extra,
      }),
      cwd: projectDir,
      env: env(),
    });
  }

  // The hooks are plain node so that a session measured now stays readable later, by a CLI
  // that was not installed when it ran.
  it("journals a whole Claude Code session with no aidd on the path", async () => {
    await enableTelemetry();
    await replayHook("claude-code-session-start", "session-start", {});
    await replayHook("claude-code-post-tool-use-skill", "tool-used", {
      tool_input: { skill: "aidd-dev:02-implement" },
    });

    const journals = readdirSync(join(projectDir, "aidd_docs", "runs")).filter((name) =>
      name.endsWith(".jsonl")
    );
    expect(journals).toHaveLength(1);

    const lines = readFileSync(join(projectDir, "aidd_docs", "runs", journals[0] ?? ""), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });
    expect(lines.map((line) => line.type)).toContain("session_start");
    expect(lines.map((line) => line.type)).toContain("step_start");
  });

  // Neither `enableTelemetry` nor `replayHook` invokes the binary: `runCli` below is this
  // test's first, and it runs after every write has already happened.
  it("reads a session's figures complete, though the CLI did not exist when it ran", async () => {
    await enableTelemetry();
    await replayHook("claude-code-session-start", "session-start", {});
    await replayHook("claude-code-post-tool-use-skill", "tool-used", {
      tool_input: { skill: "aidd-dev:02-implement" },
    });
    const notes = join(
      projectDir,
      "aidd_docs",
      "tasks",
      "2026_08",
      "2026_08_21_probe-task",
      "notes.md"
    );
    await mkdir(dirname(notes), { recursive: true });
    await writeFile(notes, "probe\n", "utf-8");
    await replayHook("claude-code-post-tool-use-write", "tool-used", {
      tool_input: { file_path: notes, content: "probe" },
    });
    await replayHook("claude-code-session-start", "turn-end", {});

    // `read` takes no session identifier: absent one it reads every session the run journal
    // knows about, which here is the file the hooks just wrote.
    const read = await runCli(["telemetry", "read"], projectDir, fakeHome, {
      env: { AIDD_USER_CONFIG_DIR: configDir },
    });
    expect(read.exitCode, read.stderr).toBe(0);
    expect(read.stdout).toContain("Claude Code: read");

    // The captured transcript falls in August 2026, so the period is fixed rather than
    // relative to whatever week this suite runs in.
    const period = ["--from", "2026-08-01", "--to", "2026-08-31"];
    const reported = await runCli(
      ["telemetry", "report", ...period, "--json"],
      projectDir,
      fakeHome,
      {
        env: { AIDD_USER_CONFIG_DIR: configDir },
      }
    );
    expect(reported.exitCode, reported.stderr).toBe(0);
    const envelope = JSON.parse(reported.stdout) as {
      totals: { requests: number; input_tokens: number; output_tokens: number };
      by_step: readonly { step?: string }[];
    };
    expect(envelope.totals.requests).toBeGreaterThan(0);
    expect(envelope.totals.input_tokens + envelope.totals.output_tokens).toBeGreaterThan(0);
    expect(envelope.by_step.map((row) => row.step)).toContain("probe-echo");

    // The same figures a session recorded with the CLI present yields: they do not shrink
    // for having been measured without it.
    const reportedText = await runCli(["telemetry", "report", ...period], projectDir, fakeHome, {
      env: { AIDD_USER_CONFIG_DIR: configDir },
    });
    expect(reportedText.stdout).toContain(SESSION_TOKENS);

    // Task identity exists only in the journal's own `file_written` line: the transcript
    // fixture has no notion of a task folder, so narrowing proves `read` consulted it.
    const byTask = await runCli(
      ["telemetry", "report", ...period, "--task", TASK],
      projectDir,
      fakeHome,
      { env: { AIDD_USER_CONFIG_DIR: configDir } }
    );
    expect(byTask.stdout).toContain(`task ${TASK}`);
    expect(byTask.stdout).toContain(SESSION_TOKENS);
  });
});

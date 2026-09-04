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

  /** What used to be `telemetry-switch.cjs on` — the switch moved behind `aidd telemetry
   * on` in phase 3, so writing the file directly is what proves this section's actual
   * claim (the hooks record with no CLI on the path) without depending on a binary this
   * section's own environment deliberately excludes from `PATH`. The switch itself, and
   * its own edge cases, are pinned in `cli/tests/e2e/telemetry.e2e.test.ts` and
   * `cli/tests/e2e/telemetry-on-runs-privacy.e2e.test.ts`. */
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

  // Recording, with no `aidd` anywhere. This is the half of the promise that survives the
  // read path moving into the CLI, and the reason the hooks stayed plain node: a session
  // measured now is readable later, by a CLI that was not installed when it ran. Answering is
  // pinned separately, in telemetry-cost-skill-commands.e2e.test.ts. Turning measurement on
  // moved behind `aidd telemetry on` in phase 3, so it is no longer this section's own claim
  // — `enableTelemetry` seeds the switch directly, and only the journaling below runs with
  // no CLI anywhere on `PATH`.
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

  // The whole promise phase 6 exists to restate, proven end to end rather than in two
  // halves that each assume the other: a session is journalled with `aidd` nowhere on
  // this machine at all, and only afterwards is the CLI invoked to read it back. Neither
  // `enableTelemetry` nor `replayHook` above ever calls it; `runCli` below is the first
  // invocation of `dist/cli.js` in this test, and it runs after every write has already
  // happened.
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

    // Only now does the CLI run at all, against the exact project and home the hooks above
    // wrote into with no CLI on the path and no CLI ever invoked. `read` has no session
    // identifier of its own to look for — `ReadLocalCostOptions`'s own doc comment: absent
    // one, it "reads every session the run journal knows about", the file just written
    // with no CLI present. Finding anything at all below already answers the question;
    // the `--task` assertion further down narrows to a fact the transcript itself could
    // never state, and could only have come from that same journal.
    const read = await runCli(["telemetry", "read"], projectDir, fakeHome, {
      env: { AIDD_USER_CONFIG_DIR: configDir },
    });
    expect(read.exitCode, read.stderr).toBe(0);
    expect(read.stdout).toContain("Claude Code: read");

    // The captured fixture's own transcript falls in August 2026, not whatever week this
    // suite happens to run in - the same period `telemetry-lifecycle.e2e.test.ts` names for
    // the identical fixture, wide enough to cover it regardless of today's date.
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

    // The same figures, exactly, as `telemetry-lifecycle.e2e.test.ts` pins from a session
    // where the CLI was present throughout — this session's own numbers do not shrink for
    // having been recorded without it.
    const reportedText = await runCli(["telemetry", "report", ...period], projectDir, fakeHome, {
      env: { AIDD_USER_CONFIG_DIR: configDir },
    });
    expect(reportedText.stdout).toContain(SESSION_TOKENS);

    // The load-bearing assertion: task identity exists only in the journal's own
    // `file_written` line (`aidd_docs/tasks/2026_08/2026_08_21_probe-task/notes.md`,
    // written above with no CLI anywhere) — the transcript fixture has no notion of an
    // AIDD task folder at all. `--task` narrowing to this exact figure, rather than
    // "nothing in this selection", is possible only because `read` consulted that line.
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

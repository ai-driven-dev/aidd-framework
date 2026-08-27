import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/infrastructure/git-environment.js";
import { copyFixtureTree, pathWithoutAidd } from "./helpers.js";

const REPO_ROOT = resolve(process.cwd(), "..");
const JOURNAL_HOOK = join(REPO_ROOT, "plugins", "aidd-telemetry", "hooks", "journal.cjs");
const LOCAL_COST_FIXTURES = join(process.cwd(), "tests", "fixtures", "local-cost");
const HOOK_FIXTURES = join(REPO_ROOT, "scripts", "__tests__", "fixtures");

const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";

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
});

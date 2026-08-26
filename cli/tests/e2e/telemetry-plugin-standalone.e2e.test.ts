import { execFile, execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/infrastructure/git-environment.js";
import { copyFixtureTree, pathWithoutAidd } from "./helpers.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(process.cwd(), "..");
/** Each script ships inside the skill that owns it, not in a shared top-level directory:
 * a plugin is installed by translating its files into each tool's own layout, and that
 * translation carries `skills/` and drops directories it does not know. Splitting them in
 * two is what lets neither skill open a file belonging to the other. */
const SKILLS = join(REPO_ROOT, "plugins", "aidd-telemetry", "skills");
const SWITCH_BIN = join(SKILLS, "00-init", "scripts", "telemetry-switch.cjs");
const JOURNAL_HOOK = join(REPO_ROOT, "plugins", "aidd-telemetry", "hooks", "journal.cjs");
const LOCAL_COST_FIXTURES = join(process.cwd(), "tests", "fixtures", "local-cost");
const HOOK_FIXTURES = join(REPO_ROOT, "scripts", "__tests__", "fixtures");

const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";
const _PERIOD = ["--from", "2026-08-01", "--to", "2026-08-31"] as const;

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

  async function run(
    bin: string,
    args: readonly string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const { stdout, stderr } = await execFileAsync(process.execPath, [bin, ...args], {
        cwd: projectDir,
        env: env(),
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: failed.stdout ?? "",
        stderr: failed.stderr ?? "",
        exitCode: failed.code ?? 1,
      };
    }
  }

  /** Each skill's own script, named as the skill that owns it would run it. */
  function switchTo(state: string) {
    return run(SWITCH_BIN, [state]);
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

  it("turns measurement on without a second tool installed", async () => {
    const result = await switchTo("on");

    expect(result.exitCode, result.stderr).toBe(0);
    const config = JSON.parse(await readFile(join(projectDir, ".aidd", "config.json"), "utf8"));
    expect(config.telemetry.enabled).toBe(true);
  });

  it("keeps whatever else the project's config already held", async () => {
    await mkdir(join(projectDir, ".aidd"), { recursive: true });
    await writeFile(
      join(projectDir, ".aidd", "config.json"),
      JSON.stringify({ somethingElse: { kept: true }, telemetry: { endpoint: "http://x" } }),
      "utf-8"
    );

    await switchTo("on");

    const config = JSON.parse(await readFile(join(projectDir, ".aidd", "config.json"), "utf8"));
    expect(config.somethingElse).toEqual({ kept: true });
    expect(config.telemetry).toEqual({ endpoint: "http://x", enabled: true });
  });

  it("turns it back off again", async () => {
    await switchTo("on");
    await switchTo("off");

    const config = JSON.parse(await readFile(join(projectDir, ".aidd", "config.json"), "utf8"));
    expect(config.telemetry.enabled).toBe(false);
  });

  // Recording, with no `aidd` anywhere. This is the half of the promise that survives the
  // read path moving into the CLI, and the reason the hooks stayed plain node: a session
  // measured now is readable later, by a CLI that was not installed when it ran. Answering is
  // pinned separately, in telemetry-cost-skill-commands.e2e.test.ts.
  it("journals a whole Claude Code session with no aidd on the path", async () => {
    expect(await switchTo("on")).toMatchObject({ exitCode: 0 });
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

describe("what the plugin ships is readable", () => {
  it("keeps the switch short enough to read before allowing anything", () => {
    expect(readFileSync(SWITCH_BIN, "utf8").split("\n").length).toBeLessThan(80);
  });
});

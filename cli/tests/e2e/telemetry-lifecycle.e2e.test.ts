import { execFile, execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/infrastructure/git-environment.js";
import { CLI_PATH, copyFixtureTree, pathWithoutAidd } from "./helpers.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(process.cwd(), "..");
const PLUGIN = join(REPO_ROOT, "plugins", "aidd-telemetry");
const JOURNAL_HOOK = join(PLUGIN, "hooks", "journal.cjs");
const HOOK_FIXTURES = join(REPO_ROOT, "scripts", "__tests__", "fixtures");
const LOCAL_COST_FIXTURES = join(process.cwd(), "tests", "fixtures", "local-cost");

const SESSION = "22222222-2222-4222-8222-222222222222";
const TASK = "2026_08/2026_08_21_probe-task";
const PERIOD = ["--from", "2026-08-01", "--to", "2026-08-31"] as const;
/** Every token the captured Claude Code session billed, recomputed in
 * `telemetry-plugin-standalone.e2e.test.ts` from the transcript itself. */
const SESSION_TOKENS = "151,826";

interface Run {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * The whole life of measurement on one project, in order, with nothing but node.
 *
 * Not a feature test: each step is only meaningful because of the one before it. Reporting
 * before enabling has to answer nothing rather than fail; disabling has to stop the
 * recording without erasing what was already measured; re-enabling has to resume rather
 * than start over. A test per step would pass while the sequence was broken.
 */
describe("measurement, from nothing to off and back", () => {
  let projectDir: string;
  let fakeHome: string;
  let configDir: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = realpathSync(await mkdtemp(join(tmpdir(), "aidd-lifecycle-")));
    projectDir = join(tempDir, "project");
    fakeHome = join(tempDir, "home");
    configDir = join(tempDir, "config");
    await mkdir(projectDir, { recursive: true });
    await mkdir(fakeHome, { recursive: true });
    execFileSync("git", ["init", "-q", projectDir], {
      env: environmentWithoutGitVariables(process.env),
    });
    // The tool's own transcript, exactly as a machine that ran the session would hold it.
    await copyFixtureTree(LOCAL_COST_FIXTURES, fakeHome);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  /** Only node's own directory: no `aidd`, and nothing from this repository's
   * `node_modules`. The plugin has to be enough. */
  function env(): NodeJS.ProcessEnv {
    return {
      ...environmentWithoutGitVariables(process.env),
      PATH: pathWithoutAidd(),
      HOME: fakeHome,
      AIDD_USER_CONFIG_DIR: configDir,
    };
  }

  async function run(bin: string, args: readonly string[]): Promise<Run> {
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

  /** The switch moved from `telemetry-switch.cjs` to `aidd telemetry on|off` in phase 3;
   * invoked the same way `measure` calls the CLI, by its own built path, so the `PATH`
   * this file strips `aidd` from still proves nothing about the switch or the reader —
   * only that the hooks below need neither. */
  const switchTo = (state: "on" | "off") =>
    run(CLI_PATH, state === "on" ? ["telemetry", "on", "--yes"] : ["telemetry", "off"]);
  /** Reading is the CLI's, and only the CLI's, since the plugin's own reporter was deleted:
   * one implementation answers, and this cycle exercises the one that ships. */
  const measure = (args: readonly string[]) => run(CLI_PATH, args.slice());

  /** One captured hook payload, retargeted at this project and session. The hook decides
   * the host from the payload's own shape, so nothing here tells it which tool it is. */
  async function hook(fixture: string, event: string, extra: object = {}): Promise<void> {
    const payload = JSON.parse(await readFile(join(HOOK_FIXTURES, `${fixture}.json`), "utf8"));
    execFileSync(process.execPath, [JOURNAL_HOOK, event], {
      input: JSON.stringify({
        ...payload,
        session_id: SESSION,
        transcript_path: join(fakeHome, ".claude", "projects", "fake-project", `${SESSION}.jsonl`),
        cwd: projectDir,
        ...extra,
      }),
      cwd: projectDir,
      env: env(),
    });
  }

  /** A whole session as the host reports it: it starts, a skill opens, a file lands in a
   * task folder, the turn ends. */
  async function aSessionRuns(): Promise<void> {
    await hook("claude-code-session-start", "session-start");
    await hook("claude-code-post-tool-use-skill", "tool-used", {
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
    await hook("claude-code-post-tool-use-write", "tool-used", {
      tool_input: { file_path: notes, content: "probe" },
    });
    await hook("claude-code-session-start", "turn-end");
  }

  async function runFiles(): Promise<readonly string[]> {
    const dir = join(projectDir, "aidd_docs", "runs");
    return existsSync(dir) ? await readdir(dir) : [];
  }

  /** Every line the journal holds, across every session. Counting files would miss a
   * session that carries on: a run file is named for its session, so a second turn appends
   * to the file the first turn opened rather than starting another. */
  async function journalLines(): Promise<number> {
    const dir = join(projectDir, "aidd_docs", "runs");
    let total = 0;
    for (const name of await runFiles()) {
      total += (await readFile(join(dir, name), "utf8")).trim().split("\n").filter(Boolean).length;
    }
    return total;
  }

  it("lives the whole sequence, each step meaning what the one before it set up", async () => {
    // 1. Nothing set up at all. Answering must be empty, not broken.
    const beforeAnything = await measure(["telemetry", "report", ...PERIOD]);
    expect(beforeAnything.exitCode, beforeAnything.stderr).toBe(0);
    expect(beforeAnything.stdout).toContain("nothing in this period");
    // Never a literal zero for what nothing measured: no config at all reads as off, the
    // same as an explicit "off" would, and says so rather than reporting a bare "0".
    expect(beforeAnything.stdout).toMatch(/this project's own switch is off/u);
    expect(beforeAnything.stdout).not.toMatch(/\bsessions\s+0\b/u);
    expect(existsSync(join(projectDir, ".aidd", "config.json"))).toBe(false);

    // 2. A session runs while measuring is off. The hook must write nothing at all.
    await aSessionRuns();
    expect(await runFiles()).toEqual([]);

    // 3. Allowed.
    expect((await switchTo("on")).exitCode).toBe(0);

    // 4. A session runs. Now it is journalled.
    await aSessionRuns();
    expect(await runFiles()).toHaveLength(1);

    // 5. Read, and report. The figures carry the step the tool named and the task the
    //    journal recorded.
    const read = await measure(["telemetry", "read"]);
    expect(read.stdout).toContain("Claude Code: read (4 new of 4)");
    const reported = await measure(["telemetry", "report", ...PERIOD]);
    expect(reported.stdout).toContain(SESSION_TOKENS);
    expect(reported.stdout).toContain("probe-echo");
    // On: no word about the switch at all — a person reading figures that are visibly
    // working needs no separate sentence confirming it.
    expect(reported.stdout).not.toContain("measurement is off");
    const byTask = await measure(["telemetry", "report", ...PERIOD, "--task", TASK]);
    expect(byTask.stdout).toContain(`task ${TASK}`);
    expect(byTask.stdout).toContain(SESSION_TOKENS);

    // 6. Turned off. What was measured stays measured; only the recording stops.
    expect((await switchTo("off")).exitCode).toBe(0);
    const afterOff = await measure(["telemetry", "report", ...PERIOD]);
    expect(afterOff.stdout).toContain(SESSION_TOKENS);
    // Off, but the period still holds real history: says the switch is off *and* still
    // shows every figure already measured - neither fact stands in for the other.
    expect(afterOff.stdout).toMatch(/this project's own switch is off/u);

    // 7. A session runs while off. Not one line is journalled — the switch is read at the
    //    moment of every write, not once at startup.
    const before = await journalLines();
    expect(before).toBeGreaterThan(0);
    await aSessionRuns();
    expect(await journalLines()).toBe(before);

    // 8. Allowed again. Recording resumes into the journal that already exists rather than
    //    starting a new one, so nothing measured before is orphaned.
    await switchTo("on");
    await aSessionRuns();
    expect(await journalLines()).toBeGreaterThan(before);
    expect(await runFiles()).toHaveLength(1);

    // 9. Reading again stores nothing twice.
    const second = await measure(["telemetry", "read"]);
    expect(second.stdout).toContain("Claude Code: read (0 new of 4)");
    expect((await measure(["telemetry", "report", ...PERIOD])).stdout).toContain(SESSION_TOKENS);
  }, 60_000);

  it("leaves the project's own config alone through the whole cycle", async () => {
    await mkdir(join(projectDir, ".aidd"), { recursive: true });
    await writeFile(
      join(projectDir, ".aidd", "config.json"),
      JSON.stringify({ somethingElse: { kept: true } }),
      "utf-8"
    );

    await switchTo("on");
    await switchTo("off");
    await switchTo("on");

    const config = JSON.parse(await readFile(join(projectDir, ".aidd", "config.json"), "utf8"));
    expect(config.somethingElse).toEqual({ kept: true });
    expect(config.telemetry).toEqual({ enabled: true });
  }, 30_000);

  it("answers a program the same way through the same cycle", async () => {
    await switchTo("on");
    await aSessionRuns();
    await measure(["telemetry", "read"]);

    const envelope = JSON.parse(
      (await measure(["telemetry", "report", ...PERIOD, "--json"])).stdout
    );
    await switchTo("off");
    const afterOff = JSON.parse(
      (await measure(["telemetry", "report", ...PERIOD, "--json"])).stdout
    );

    // Turning measurement off changes what is recorded next, never what a past period
    // answers — a consumer that cached a figure must not see any of them move.
    // `measurement_enabled` is the one deliberate exception (finding 2/3, review.md "one
    // route, and every sentence about it true"): it names the switch's own state right now,
    // not a fact about the period, so it must move the instant the switch does, and would
    // be a lie if it did not.
    expect(envelope.measurement_enabled).toBe(true);
    expect(afterOff.measurement_enabled).toBe(false);
    const { measurement_enabled: _before, ...historicalFigures } = envelope;
    const { measurement_enabled: _after, ...historicalFiguresAfterOff } = afterOff;
    expect(historicalFiguresAfterOff).toEqual(historicalFigures);
    expect(envelope.cost_report_version).toBe(13);
  }, 60_000);
});

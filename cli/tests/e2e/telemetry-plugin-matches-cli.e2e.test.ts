import { execFile, execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/infrastructure/git-environment.js";
import { CLI_PATH } from "./helpers.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(process.cwd(), "..");
const PLUGIN_SCRIPT = join(
  REPO_ROOT,
  "plugins",
  "aidd-telemetry",
  "skills",
  "01-cost",
  "scripts",
  "telemetry-report.js"
);
const LOCAL_COST_FIXTURES = join(process.cwd(), "tests", "fixtures", "local-cost");

const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";
const CODEX_SESSION = "019fae6f-2009-7cd3-86b2-b8f83481b160";

/**
 * The plugin's scripts and the CLI are two implementations of one contract. That is a
 * deliberate choice — the plugin ships readable source rather than a build of the CLI —
 * and it is only safe while the two answer the same thing, byte for byte, on every path
 * anyone can take.
 *
 * This is the check that makes it safe. It runs both against the same files and compares
 * raw bytes, so a divergence in a field, a key order, or an error message fails here
 * rather than in someone's report. Written after two real divergences it would have
 * caught: a missing `agent_name` and a missing `effort`.
 */
describe("the plugin's scripts answer exactly what the CLI answers", () => {
  let projectDir: string;
  let fakeHome: string;
  let cliConfig: string;
  let pluginConfig: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = realpathSync(await mkdtemp(join(tmpdir(), "aidd-equivalence-")));
    projectDir = join(tempDir, "project");
    fakeHome = join(tempDir, "home");
    cliConfig = join(tempDir, "config-cli");
    pluginConfig = join(tempDir, "config-plugin");
    await mkdir(projectDir, { recursive: true });
    await mkdir(fakeHome, { recursive: true });
    execFileSync("git", ["init", "-q", projectDir]);
    await execFileAsync("cp", ["-R", `${LOCAL_COST_FIXTURES}/.`, fakeHome]);
    await seedJournals();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  /** Two journalled sessions, one per readable tool, so the comparison covers both
   * attribution strengths and both readers. */
  async function seedJournals(): Promise<void> {
    const runs = join(projectDir, "aidd_docs", "runs");
    await mkdir(runs, { recursive: true });
    const line = (value: unknown) => `${JSON.stringify(value)}\n`;
    await writeFile(
      join(runs, `01ARZ3NDEKTSV4RRFFQ69G5FBW__${CODEX_SESSION}.jsonl`),
      line({
        type: "session_start",
        at: "2026-07-29T15:10:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FBW",
        tool: "codex",
        vendor_id: CODEX_SESSION,
        // Both project fields present, so this session exercises the branch that prefers
        // the remote - the CLAUDE_SESSION below exercises the no-remote fallback.
        project_id: "acme-widgets",
        project_remote: "git@github.com:acme/widgets.git",
      }) +
        line({ type: "step_start", at: "2026-07-29T15:11:00Z", skill: "aidd-dev:02-implement" }) +
        line({ type: "turn_end", at: "2026-07-29T15:30:00Z" })
    );
    await writeFile(
      join(runs, `01ARZ3NDEKTSV4RRFFQ69G5FAV__${CLAUDE_SESSION}.jsonl`),
      line({
        type: "session_start",
        at: "2026-08-05T19:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        tool: "claude-code",
        vendor_id: CLAUDE_SESSION,
        project_id: "brainstorm-telemetry",
      }) + line({ type: "turn_end", at: "2026-08-05T20:00:00Z" })
    );
  }

  /** No `aidd` on the path, and nothing from this repository's `node_modules`: whatever
   * the plugin's script needs, it has to bring. */
  function env(configDir: string): NodeJS.ProcessEnv {
    return {
      ...environmentWithoutGitVariables(process.env),
      PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter),
      HOME: fakeHome,
      AIDD_USER_CONFIG_DIR: configDir,
    };
  }

  async function capture(command: readonly string[], configDir: string): Promise<string> {
    try {
      const { stdout, stderr } = await execFileAsync(process.execPath, [...command], {
        cwd: projectDir,
        env: env(configDir),
      });
      return `${stdout}${stderr}`;
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string };
      return `${failed.stdout ?? ""}${failed.stderr ?? ""}`;
    }
  }

  function bothOf(args: readonly string[]): Promise<[string, string]> {
    return Promise.all([
      capture([CLI_PATH, "telemetry", ...args], cliConfig),
      capture([PLUGIN_SCRIPT, ...args], pluginConfig),
    ]);
  }

  function storedIn(configDir: string): string {
    const dir = join(configDir, "telemetry");
    return readdirSync(dir)
      .sort()
      .map((name) => readFileSync(join(dir, name), "utf8"))
      .join("");
  }

  it("stores the same records, field for field and in the same order", async () => {
    const [fromCli, fromPlugin] = await bothOf(["read"]);

    expect(fromPlugin).toBe(fromCli);
    // Not only the printed answer: the lines that land on disk are what every later report
    // is built from, so a divergence there would outlive the run that caused it.
    expect(storedIn(pluginConfig)).toBe(storedIn(cliConfig));
    expect(storedIn(cliConfig).trim().split("\n")).toHaveLength(6);
  });

  it("answers a person the same way, on every shape of period", async () => {
    await bothOf(["read"]);

    for (const args of [
      ["report", "--from", "2026-07-01", "--to", "2026-08-31"],
      ["report", "--from", "2026-08-05", "--to", "2026-08-05"],
      ["report", "--days", "3"],
      ["report", "--from", "2026-08-31", "--to", "2026-08-01"],
    ]) {
      const [fromCli, fromPlugin] = await bothOf(args);
      expect(fromPlugin, args.join(" ")).toBe(fromCli);
    }
  });

  it("answers a program the same way, including what each tool can supply", async () => {
    await bothOf(["read"]);

    const [fromCli, fromPlugin] = await bothOf([
      "report",
      "--from",
      "2026-07-01",
      "--to",
      "2026-08-31",
      "--json",
    ]);

    expect(fromPlugin).toBe(fromCli);
    const envelope = JSON.parse(fromPlugin);
    expect(envelope.cost_report_version).toBe(2);
    expect(envelope.by_tool.map((row: { tool: string }) => row.tool)).toHaveLength(5);
  });

  it("attributes a task the same way, and an absent one the same way too", async () => {
    await bothOf(["read"]);

    for (const task of ["2026_08/nothing-wrote-here", "2026_08/2026_08_21_cost-reporter"]) {
      const [fromCli, fromPlugin] = await bothOf([
        "report",
        "--from",
        "2026-07-01",
        "--to",
        "2026-08-31",
        "--task",
        task,
      ]);
      expect(fromPlugin, task).toBe(fromCli);
    }
  });

  it("refuses a period that is not one with the same words", async () => {
    // An error message is part of the contract: two tools that disagree about why
    // something failed are two tools a user cannot reason about together.
    for (const args of [
      ["report", "--from", "notaday"],
      ["report", "--to", "2026-02-31"],
      ["report", "--days", "0"],
      ["report", "--days", "many"],
    ]) {
      const [fromCli, fromPlugin] = await bothOf(args);
      expect(fromPlugin, args.join(" ")).toBe(fromCli);
      expect(fromPlugin).toMatch(/Invalid --/u);
    }
  });

  it("reports one named session the same way as the sweep would", async () => {
    const [fromCli, fromPlugin] = await bothOf(["read", "--session", CODEX_SESSION]);

    expect(fromPlugin).toBe(fromCli);
    expect(storedIn(pluginConfig)).toBe(storedIn(cliConfig));
  });
});

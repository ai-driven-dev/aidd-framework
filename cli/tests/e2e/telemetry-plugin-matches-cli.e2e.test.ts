import { execFile, execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/infrastructure/git-environment.js";
import { CLI_PATH, copyFixtureTree, identityFileIn, pathWithoutAidd } from "./helpers.js";

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
const COPILOT_SESSION = "33333333-3333-4333-8333-333333333333";

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
    await copyFixtureTree(LOCAL_COST_FIXTURES, fakeHome);
    await seedJournals();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  /** Three journalled sessions, one per readable tool exercised here, so the comparison
   * covers both attribution strengths and every reader — Copilot's own `kind: "session"`
   * local-read total (#697) included. */
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
    await writeFile(
      join(runs, `01ARZ3NDEKTSV4RRFFQ69G5FBX__${COPILOT_SESSION}.jsonl`),
      line({
        type: "session_start",
        at: "2026-08-21T14:07:44.991Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FBX",
        tool: "copilot",
        vendor_id: COPILOT_SESSION,
        project_id: "brainstorm-telemetry",
      }) + line({ type: "turn_end", at: "2026-08-21T14:07:49.286Z" })
    );
  }

  /** No `aidd` on the path, and nothing from this repository's `node_modules`: whatever
   * the plugin's script needs, it has to bring. */
  function env(configDir: string): NodeJS.ProcessEnv {
    return {
      ...environmentWithoutGitVariables(process.env),
      PATH: pathWithoutAidd(),
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
    expect(storedIn(cliConfig).trim().split("\n")).toHaveLength(7);

    // A re-read must not inflate Copilot's session total: its record's `turn_id` (the
    // shutdown event's own id) is what a sweep matches on, same mechanism as every other
    // reader here, now actually exercised for this tool rather than merely asserted present.
    await bothOf(["read"]);

    expect(storedIn(cliConfig).trim().split("\n")).toHaveLength(7);
    expect(storedIn(pluginConfig)).toBe(storedIn(cliConfig));
  });

  it("stamps the same person on both sides once one opted in, and neither by default", async () => {
    const [, defaultPlugin] = await bothOf(["read"]);
    expect(defaultPlugin).not.toContain("person_id");
    for (const stored of [storedIn(cliConfig), storedIn(pluginConfig)]) {
      for (const line of stored.trim().split("\n")) {
        expect(JSON.parse(line)).not.toHaveProperty("person_id");
      }
    }

    const identityFile = identityFileIn(fakeHome);
    await mkdir(dirname(identityFile), { recursive: true });
    await writeFile(
      identityFile,
      JSON.stringify({ person_id: "person-e2e-1", display_name: "Baptiste" })
    );
    await rm(join(cliConfig, "telemetry"), { recursive: true, force: true });
    await rm(join(pluginConfig, "telemetry"), { recursive: true, force: true });

    const [fromCli, fromPlugin] = await bothOf(["read"]);
    expect(fromPlugin).toBe(fromCli);
    expect(storedIn(pluginConfig)).toBe(storedIn(cliConfig));
    for (const line of storedIn(cliConfig).trim().split("\n")) {
      const record = JSON.parse(line);
      expect(record.person_id).toBe("person-e2e-1");
      expect(record.person_display_name).toBe("Baptiste");
    }

    // Person is not yet a report dimension (phase 3) - a report built over records that
    // do carry it must still agree between the two sides, and must not leak the field
    // into an envelope shape that has not been extended for it.
    const [reportCli, reportPlugin] = await bothOf([
      "report",
      "--from",
      "2026-07-01",
      "--to",
      "2026-08-31",
      "--json",
    ]);
    expect(reportPlugin).toBe(reportCli);
    expect(reportPlugin).not.toContain("person");
  });

  it("cannot be handed an identity through AIDD_USER_CONFIG_DIR - only this machine's own profile counts", async () => {
    // cliConfig/pluginConfig are each an AIDD_USER_CONFIG_DIR - a location the README
    // documents pointing at a directory a team or a CI can share. Planting an identity
    // file there, rather than under fakeHome, must change nothing.
    await mkdir(cliConfig, { recursive: true });
    await mkdir(pluginConfig, { recursive: true });
    await writeFile(
      join(cliConfig, "identity.json"),
      JSON.stringify({ person_id: "forced-by-a-shared-config-dir" })
    );
    await writeFile(
      join(pluginConfig, "identity.json"),
      JSON.stringify({ person_id: "forced-by-a-shared-config-dir" })
    );

    const [fromCli, fromPlugin] = await bothOf(["read"]);
    expect(fromPlugin).toBe(fromCli);
    expect(fromPlugin).not.toContain("forced-by-a-shared-config-dir");
    for (const stored of [storedIn(cliConfig), storedIn(pluginConfig)]) {
      expect(stored).not.toContain("forced-by-a-shared-config-dir");
    }
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

  const REPORTING_PERIOD = ["--from", "2026-07-01", "--to", "2026-08-31"];
  // The codex session's own remote wins over its `project_id` (metrics-contract.md), so
  // this - not "acme-widgets" - is what every stored record from it actually carries.
  const CODEX_PROJECT = "git@github.com:acme/widgets.git";

  it("filters the same way it groups, alone, composed, and against itself grouped", async () => {
    await bothOf(["read"]);

    for (const args of [
      ["report", ...REPORTING_PERIOD, "--project", CODEX_PROJECT],
      ["report", ...REPORTING_PERIOD, "--tool", "codex"],
      // Composed: project as filter, and a second, unrelated filter narrowing further.
      [
        "report",
        ...REPORTING_PERIOD,
        "--project",
        CODEX_PROJECT,
        "--step",
        "aidd-dev:02-implement",
      ],
      // Filtering and grouping on the same dimension - one row, not an error, on both sides.
      ["report", ...REPORTING_PERIOD, "--project", CODEX_PROJECT, "--json"],
    ]) {
      const [fromCli, fromPlugin] = await bothOf(args);
      expect(fromPlugin, args.join(" ")).toBe(fromCli);
    }

    const [, fromPlugin] = await bothOf([
      "report",
      ...REPORTING_PERIOD,
      "--project",
      CODEX_PROJECT,
      "--json",
    ]);
    expect(JSON.parse(fromPlugin).by_project).toHaveLength(1);
  });

  /**
   * `--axis` is the one flag this suite does not hold the two to byte-for-byte: it picks
   * one artefact rendering, a plugin-only convenience this phase did not extend to the
   * CLI (a markdown-table renderer, not a filter). Left unaddressed, that gap would be
   * silent - a CLI told `--axis` today would need to at least refuse it loudly rather
   * than quietly ignoring it. This pins the refusal down so a future change to flag
   * parsing cannot regress it into a silent no-op.
   */
  it("refuses --axis loudly rather than silently ignoring it - the one flag not held to parity", async () => {
    const [fromCli, fromPlugin] = await bothOf([
      "report",
      ...REPORTING_PERIOD,
      "--axis",
      "project",
    ]);

    expect(fromPlugin).toContain("axis: by project");
    expect(fromCli).toMatch(/unknown option.*--axis/u);
    expect(fromCli).not.toBe(fromPlugin);
  });

  it("names an empty selection the same way, a never-known value and a known-idle one", async () => {
    await bothOf(["read"]);

    // Unknown: no session anywhere in this sink ever named this project.
    const [unknownCli, unknownPlugin] = await bothOf([
      "report",
      ...REPORTING_PERIOD,
      "--project",
      "never-heard-of-this-repo",
      "--json",
    ]);
    expect(unknownPlugin).toBe(unknownCli);
    expect(JSON.parse(unknownPlugin).empty_selection).toEqual({
      filter: "project",
      value: "never-heard-of-this-repo",
      known: false,
    });

    // Known: the codex project is real, just not on the one day this narrower period
    // covers (the codex session ran in July; this asks about one day in August).
    const [knownCli, knownPlugin] = await bothOf([
      "report",
      "--from",
      "2026-08-05",
      "--to",
      "2026-08-05",
      "--project",
      CODEX_PROJECT,
      "--json",
    ]);
    expect(knownPlugin).toBe(knownCli);
    expect(JSON.parse(knownPlugin).empty_selection).toEqual({
      filter: "project",
      value: CODEX_PROJECT,
      known: true,
    });
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

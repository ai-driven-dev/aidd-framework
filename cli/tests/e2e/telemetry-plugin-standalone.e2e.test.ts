import { execFile, execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/infrastructure/git-environment.js";
import { CLI_PATH } from "./helpers.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(process.cwd(), "..");
/** Each script ships inside the skill that owns it, not in a shared top-level directory:
 * a plugin is installed by translating its files into each tool's own layout, and that
 * translation carries `skills/` and drops directories it does not know. Splitting them in
 * two is what lets neither skill open a file belonging to the other. */
const SKILLS = join(REPO_ROOT, "plugins", "aidd-telemetry", "skills");
const SWITCH_BIN = join(SKILLS, "00-init", "scripts", "telemetry-switch.js");
const REPORT_BIN = join(SKILLS, "01-cost", "scripts", "telemetry-report.js");
const JOURNAL_HOOK = join(REPO_ROOT, "plugins", "aidd-telemetry", "hooks", "journal.js");
const LOCAL_COST_FIXTURES = join(process.cwd(), "tests", "fixtures", "local-cost");
const HOOK_FIXTURES = join(REPO_ROOT, "scripts", "__tests__", "fixtures");

const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";
const PERIOD = ["--from", "2026-08-01", "--to", "2026-08-31"] as const;

/** No directory holding `aidd`, and no directory holding the repository's `node_modules`
 * binaries — only node's own. The point of this file is that nothing else is needed. */
function pathWithoutAidd(): string {
  const nodeDir = dirname(process.execPath);
  return [nodeDir, "/usr/bin", "/bin"].join(delimiter);
}

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
    execFileSync("git", ["init", "-q", projectDir]);
    // The tools' own files, exactly as a machine that ran them would hold.
    await execFileAsync("cp", ["-R", `${LOCAL_COST_FIXTURES}/.`, fakeHome]);
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

  function measure(args: readonly string[]) {
    return run(REPORT_BIN, args);
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

  it("runs the whole chain on Claude Code with no aidd on the path", async () => {
    expect(await switchTo("on")).toMatchObject({ exitCode: 0 });
    await replayHook("claude-code-session-start", "session-start", {});
    await replayHook("claude-code-post-tool-use-skill", "tool-used", {
      tool_input: { skill: "aidd-dev:02-implement" },
    });

    const read = await measure(["read"]);
    expect(read.exitCode, read.stderr).toBe(0);
    expect(read.stdout).toContain("1 session read");
    expect(read.stdout).toContain("Claude Code: read (4 new of 4)");

    const report = await measure(["report", ...PERIOD]);
    expect(report.exitCode, report.stderr).toBe(0);
    // Four billed requests from the captured transcript, and the skill the tool named
    // itself on the subagent's own line.
    expect(report.stdout).toContain("151,826");
    expect(report.stdout).toContain("probe-echo");
    expect(report.stdout).toContain("stated by the tool");
    // No tool read locally carries a currency figure; a zero here would read as free.
    expect(report.stdout).toContain("amount unknown");
    expect(report.stdout).not.toContain("$0.00");
  });

  it("answers a program with the object the contract describes", async () => {
    await switchTo("on");
    await replayHook("claude-code-session-start", "session-start", {});
    await measure(["read"]);

    const result = await measure(["report", ...PERIOD, "--json"]);
    const envelope = JSON.parse(result.stdout);

    expect(envelope.cost_report_version).toBe(1);
    expect(envelope.period).toEqual({ from_day: "2026-08-01", to_day: "2026-08-31" });
    expect(envelope.attribution.map((row: { attribution: string }) => row.attribution)).toEqual([
      "tool-stated",
      "journal-interval",
      "unattributed",
    ]);
    const claude = envelope.by_tool.find((row: { tool: string }) => row.tool === "claude");
    expect(claude.capability).toMatchObject({
      task_attributable: true,
      journal_attributable: true,
    });
  });

  it("answers exactly what the CLI answers, for the same inputs", async () => {
    // Two builds of one contract is the failure this whole layer exists to prevent. They
    // wire the same classes, so this holds by construction — and is asserted so that it
    // keeps holding.
    await switchTo("on");
    await replayHook("claude-code-session-start", "session-start", {});
    await measure(["read"]);

    const fromPlugin = await measure(["report", ...PERIOD, "--json"]);
    const { stdout: fromCli } = await execFileAsync(
      process.execPath,
      [CLI_PATH, "telemetry", "report", ...PERIOD, "--json"],
      { cwd: projectDir, env: { ...env(), PATH: process.env.PATH ?? "" } }
    );

    expect(fromPlugin.stdout).toBe(fromCli);
  });

  it("prints usage and exits 1 for a subcommand it does not have", async () => {
    const result = await measure(["explode"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });
});

describe("the committed bundle", () => {
  for (const bin of [SWITCH_BIN, REPORT_BIN]) {
    it(`${bin.split("/").slice(-3).join("/")} carries a shebang and requires nothing but node's own modules`, () => {
      const bundle = readFileSync(bin, "utf8");
      // CommonJS, matching the hooks beside it, so the dependency edges are `require` calls.
      // The bundle is minified, so a bare `require("` also occurs inside string literals —
      // matching those would report noise as dependencies.
      const specifiers = [...bundle.matchAll(/(?:^|[^\w.])require\(\s*"([^"]+)"\s*\)/gu)]
        .map((match) => match[1] ?? "")
        .filter((specifier) => !specifier.startsWith("."));
      const external = specifiers.filter(
        (specifier) => !builtinModules.includes(specifier.replace(/^node:/u, ""))
      );

      expect(bundle.startsWith("#!/usr/bin/env node")).toBe(true);
      expect(
        specifiers.length,
        "no require call found — the check matched nothing"
      ).toBeGreaterThan(0);
      // A dependency left external would need `node_modules` beside the plugin, which a
      // plugin copied verbatim into someone's project will never have.
      expect(external).toEqual([]);
    });
  }

  it("is small enough to ship inside a plugin", () => {
    // Not a style rule: this file is copied into every project that installs the plugin.
    // The number is generous; it exists so that pulling in a renderer or a git library by
    // accident is noticed here rather than by whoever clones the repository.
    expect(readFileSync(REPORT_BIN).byteLength).toBeLessThan(250 * 1024);
  });
});

describe("the committed bundle cannot drift from its source", () => {
  it("is byte-identical to a fresh build of the source it is generated from", async () => {
    // The plugin ships a build artefact, because a plugin is copied verbatim and cannot run
    // an install step. Committing a build artefact means it can go stale, so it is rebuilt
    // here and compared — a source change without a rebuild fails now rather than shipping
    // a plugin that measures with last week's rules.
    const into = await mkdtemp(join(tmpdir(), "aidd-bundle-check-"));
    try {
      execFileSync(
        process.execPath,
        [
          join(process.cwd(), "node_modules", "tsup", "dist", "cli-default.js"),
          "--config",
          "tsup.plugin-bin.ts",
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, AIDD_PLUGIN_BIN_OUT_DIR: into },
          stdio: "pipe",
        }
      );

      for (const [name, committed] of [
        ["telemetry-switch.js", SWITCH_BIN],
        ["telemetry-report.js", REPORT_BIN],
      ] as const) {
        expect(readFileSync(join(into, name), "utf8"), name).toBe(readFileSync(committed, "utf8"));
      }
    } finally {
      await rm(into, { recursive: true, force: true });
    }
  }, 60_000);
});

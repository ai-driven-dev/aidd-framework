import { resolve } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import "../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import { MarketplaceSourceMode } from "../../../src/contexts/distribution/domain/marketplace-source-mode.js";
import type { SetupFlow } from "../../../src/contexts/framework/domain/setup-flow.js";
import { AI_TOOL_IDS } from "../../../src/kernel/tool.js";

const resolveSourceIfNeeded = vi.fn();
const registerIfPresent = vi.fn();
const activation = vi.fn();
const setupTools = vi.fn();
const setupPluginsPrompt = vi.fn();
const setupToolsPrompt = vi.fn();
const detectContext = vi.fn();
const setupMachineScope = vi.fn();
const loadManifest = vi.fn();

vi.mock("../../../src/runtime/wiring/framework.js", () => ({
  createDeps: vi.fn(async () => ({
    fs: {},
    manifestRepo: { load: loadManifest },
    setupMarketplaceRegistration: { resolveSourceIfNeeded, registerIfPresent },
    marketplaceSyncSettingsUseCase: { execute: activation },
    setupToolsUseCase: { execute: setupTools },
    setupPluginsPromptUseCase: { execute: setupPluginsPrompt },
    currentVersionProvider: { get: () => "5.2.2" },
    setupToolsPromptUseCase: { execute: setupToolsPrompt },
    projectContextDetector: { execute: detectContext },
    setupMachineScopeUseCase: { execute: setupMachineScope },
  })),
  createMenuDeps: vi.fn(),
}));

const { createDeps } = await import("../../../src/runtime/wiring/framework.js");
const { registerSetupCommand } = await import("../../../src/presentation/commands/setup.js");

const PROJECT_ROOT = process.cwd();

let written: string[] = [];
let errors: string[] = [];

function pretendTerminal(isTTY: boolean): void {
  Object.defineProperty(process.stdout, "isTTY", { value: isTTY, configurable: true });
}

function builtFlow(): SetupFlow {
  return resolveSourceIfNeeded.mock.calls[0][0] as SetupFlow;
}

beforeEach(() => {
  vi.clearAllMocks();
  written = [];
  errors = [];
  pretendTerminal(false);
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    errors.push(String(chunk));
    return true;
  });
  loadManifest.mockResolvedValue({});
  resolveSourceIfNeeded.mockResolvedValue(undefined);
  registerIfPresent.mockResolvedValue(undefined);
  activation.mockResolvedValue({ binaryMissing: [], errors: [] });
  setupTools.mockResolvedValue({ results: [] });
  setupPluginsPrompt.mockResolvedValue(undefined);
  setupToolsPrompt.mockResolvedValue({ aiTools: ["claude"], ideTools: [] });
  detectContext.mockResolvedValue({ describe: () => "a TypeScript project" });
  setupMachineScope.mockResolvedValue({
    kind: "up-to-date",
    install: { results: [] },
    activation: { binaryMissing: [], errors: [] },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

async function run(...args: string[]): Promise<string[]> {
  const program = new Command();
  program.exitOverride();
  program.option("--verbose");
  registerSetupCommand(program);
  await program.parseAsync(["node", "aidd", "setup", ...args]);
  return written.join("").split("\n").slice(0, -1);
}

describe("aidd setup — the flow a scripted run builds", () => {
  it("names the tools it was given, installs no plugin, and registers the default source", async () => {
    expect(await run("--ai", "claude")).toEqual(["Project is up to date."]);
    expect({ ...builtFlow() }).toEqual({
      projectRoot: PROJECT_ROOT,
      source: undefined,
      aiTools: ["claude"],
      ideTools: [],
      pluginMode: "none",
      pluginNames: [],
      interactive: false,
      force: false,
      registerDefaultMarketplace: true,
      scope: "project",
    });
    expect(setupTools).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      aiTools: ["claude"],
      ideTools: [],
      force: false,
      version: "5.2.2",
    });
  });

  it("expands the all keyword to every tool of that category", async () => {
    await run("--ai", "all");

    expect(builtFlow().aiTools).toEqual([...AI_TOOL_IDS]);
  });

  it("carries a named plugin list, and its mode, into the plugin prompt", async () => {
    await run("--ai", "claude", "--plugins", "aidd-dev,aidd-pm");

    expect(builtFlow().pluginMode).toBe("named");
    expect(setupPluginsPrompt).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      mode: "named",
      pluginNames: ["aidd-dev", "aidd-pm"],
      interactive: false,
    });
  });

  it("asks for no plugin at all when the default marketplace is refused", async () => {
    await run("--ai", "claude", "--no-default-marketplace");

    expect(builtFlow().registerDefaultMarketplace).toBe(false);
    expect(setupPluginsPrompt).not.toHaveBeenCalled();
  });

  it("resolves a local source against the working directory", async () => {
    await run("--source", "local", "--path", "vendor/framework", "--ai", "claude");

    expect(builtFlow().source).toEqual(MarketplaceSourceMode.local(resolve("vendor/framework")));
  });

  it("carries the release tag a remote source was pinned to", async () => {
    await run("--source", "remote", "--release", "v1.2.3", "--ai", "claude");

    expect(builtFlow().source).toEqual(MarketplaceSourceMode.remote(undefined, "v1.2.3"));
  });

  it("hands a user scope to the machine-wide setup alone", async () => {
    await run("--ai", "claude", "--scope", "user");

    const flow = setupMachineScope.mock.calls[0][0] as SetupFlow;
    expect(flow.scope).toBe("user");
    expect(setupTools).not.toHaveBeenCalled();
    expect(resolveSourceIfNeeded).not.toHaveBeenCalled();
  });
});

describe("aidd setup — a person at a terminal", () => {
  it("greets, names what it detected, and ends with what to do next", async () => {
    pretendTerminal(true);
    setupTools.mockResolvedValue({
      results: [{ toolId: "claude", fileCount: 9, files: [], skipped: false, warnings: [] }],
    });

    expect(await run()).toEqual([
      "",
      "AI-Driven Development setup",
      "Wires your AI tools, registers the framework marketplace, installs plugins.",
      "Press Ctrl-C any time to abort.",
      "",
      "Detected: a TypeScript project.",
      "Project is up to date.",
      "Installed claude (9 files)",
      "",
      "Next steps:",
      "  aidd doctor             # verify drift",
      "  aidd marketplace list   # see registered marketplaces",
      "  aidd plugin install     # add plugins",
      "  aidd --help             # explore commands",
    ]);
    expect(builtFlow().interactive).toBe(true);
    expect(builtFlow().pluginMode).toBe("interactive");
  });

  it("stops being interactive as soon as one scripting flag is given", async () => {
    pretendTerminal(true);

    const lines = await run("--yes");

    expect(builtFlow().interactive).toBe(false);
    expect(builtFlow().pluginMode).toBe("none");
    expect(lines).toEqual(["Project is up to date."]);
  });

  it("hands this run's verbosity to the rendering, not only to the graph", async () => {
    setupTools.mockResolvedValue({
      results: [
        {
          toolId: "claude",
          fileCount: 1,
          files: [{ relativePath: "CLAUDE.md" }],
          skipped: false,
          warnings: [],
        },
      ],
    });

    await run("--verbose", "--ai", "claude");

    expect(errors).toEqual(["[verbose] Tool: claude\n", "[verbose]   + CLAUDE.md\n"]);
  });
});

describe("aidd setup — every flag that makes a run a scripted one", () => {
  it.each([
    [["--source", "remote"]],
    [["--release", "v1.2.3"]],
    [["--ai", "claude"]],
    [["--ide", "vscode"]],
    [["--plugins", "none"]],
    [["--yes"]],
  ])("stops prompting on its own once %j is given", async (args) => {
    pretendTerminal(true);

    await run(...args);

    expect(builtFlow().interactive).toBe(false);
  });

  it("keeps the detection quiet when nothing about the project was detected", async () => {
    pretendTerminal(true);
    detectContext.mockResolvedValue(undefined);

    const lines = await run();

    expect(lines).not.toContain("Detected: a TypeScript project.");
  });

  it("leaves the drift check out of the next steps when nothing was installed", async () => {
    pretendTerminal(true);

    const lines = await run();

    expect(lines).not.toContain("  aidd doctor             # verify drift");
    expect(lines).toContain("  aidd marketplace list   # see registered marketplaces");
  });
});

describe("aidd setup — what it refuses and what it reports", () => {
  it("refuses a local source with nowhere to read it from", async () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--source", "local")).rejects.toThrow("exited");

    expect(errors[0]).toBe("Error: --source local requires --path <dir>\n");
    expect(vi.mocked(createDeps)).not.toHaveBeenCalled();
  });

  it("refuses a scope it does not know", async () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--scope", "machine")).rejects.toThrow("exited");

    expect(errors[0]).toBe('Error: Invalid --scope "machine" — expected "project" or "user".\n');
    expect(vi.mocked(createDeps)).not.toHaveBeenCalled();
  });

  it("refuses an IDE id offered as an AI tool, before building anything", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--ai", "vscode")).rejects.toThrow("exited");

    expect(exit).toHaveBeenCalledWith(1);
    expect(vi.mocked(createDeps)).not.toHaveBeenCalled();
  });

  it("names a refused activation and fails the process", async () => {
    activation.mockResolvedValue({
      binaryMissing: [],
      errors: [{ scope: "claude", message: "claude CLI refused" }],
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--ai", "claude")).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      "Warning: [claude] claude CLI refused\nError: Sync failed for: claude. See the warnings above.\n"
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("names a failed install on stderr and fails the process", async () => {
    setupTools.mockRejectedValue(new Error("assets are missing"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--ai", "claude")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: assets are missing\n");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("builds the graph for this project at this run's verbosity", async () => {
    await run("--verbose", "--ai", "claude");

    expect(vi.mocked(createDeps)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      { verbose: true },
      expect.anything()
    );
  });
});

describe("aidd setup — the help surface", () => {
  function setupCommand(): Command {
    const program = new Command();
    registerSetupCommand(program);
    const setup = program.commands.find((command) => command.name() === "setup");
    if (setup === undefined) throw new Error("setup command was not registered");
    return setup;
  }

  it("describes itself against the command that acts on the framework alone", () => {
    expect(setupCommand().description()).toBe(
      "Set up or update the project to a correct state — bootstraps the whole project (marketplace, framework, tools, plugins); see `framework install`, which acts on the framework alone"
    );
  });

  it("offers a source, two tool lists, a plugin mode, a scope, and two switches", () => {
    expect(setupCommand().options.map((option) => [option.flags, option.description])).toEqual([
      ["--source <mode>", "Framework source: remote or local"],
      ["--path <dir>", "Absolute path to local framework (required with --source local)"],
      ["--release <tag>", "Marketplace release tag to fetch (e.g., v1.2.3)"],
      ["--ai <ids>", "Comma-separated AI tool IDs, or 'all' (e.g., claude,cursor or all)"],
      ["--ide <ids>", "Comma-separated IDE tool IDs, or 'all' (e.g., vscode or all)"],
      ["--plugins <mode>", "Plugin install mode: none | all | recommended | comma-separated names"],
      [
        "--no-default-marketplace",
        "Skip auto-registering aidd-framework (no source prompt, no plugin install)",
      ],
      ["--yes", "Accept defaults without prompting"],
      [
        "--scope <scope>",
        "project (default) installs into this project alone; user registers the shared " +
          "framework source and native activation machine-wide, writing nothing under this project",
      ],
    ]);
  });
});

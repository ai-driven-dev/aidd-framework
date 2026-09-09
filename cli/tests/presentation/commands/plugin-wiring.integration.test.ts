import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_TOOL_IDS } from "../../../src/kernel/tool.js";

const pluginRemove = vi.fn();
const pluginList = vi.fn();
const pluginInstall = vi.fn();
const pluginSearch = vi.fn();
const pluginUpdate = vi.fn();
const activation = vi.fn();
const menuSelect = vi.fn();
const spawn = vi.fn();

vi.mock("../../../src/runtime/wiring/framework.js", () => ({
  createDeps: vi.fn(async () => ({
    pluginRemoveUseCase: { execute: pluginRemove },
    pluginListUseCase: { execute: pluginList },
    pluginInstallUseCase: { execute: pluginInstall },
    pluginSearchUseCase: { execute: pluginSearch },
    pluginUpdateUseCase: { execute: pluginUpdate },
    marketplaceSyncSettingsUseCase: { execute: activation },
  })),
  createMenuDeps: vi.fn(() => ({ prompter: { select: menuSelect } })),
}));

vi.mock("../../../src/presentation/commands/spawn-cli-command.js", () => ({
  spawnCliCommand: spawn,
}));

const { createDeps } = await import("../../../src/runtime/wiring/framework.js");
const { registerPluginCommand } = await import("../../../src/presentation/commands/plugin.js");

const PROJECT_ROOT = process.cwd();

let written: string[] = [];
let errors: string[] = [];

function pretendTerminal(isTTY: boolean): void {
  Object.defineProperty(process.stdout, "isTTY", { value: isTTY, configurable: true });
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
  pluginRemove.mockResolvedValue(undefined);
  pluginList.mockResolvedValue(new Map([["claude", [{ name: "aidd-dev", version: "1.0.0" }]]]));
  pluginInstall.mockResolvedValue({ kind: "marketplace", installed: ["aidd-dev"] });
  pluginSearch.mockResolvedValue({ hits: [] });
  pluginUpdate.mockResolvedValue(["aidd-dev"]);
  activation.mockResolvedValue({ binaryMissing: [], errors: [] });
  menuSelect.mockResolvedValue("list");
  spawn.mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

async function run(...args: string[]): Promise<string[]> {
  const program = new Command();
  program.exitOverride();
  program.option("--verbose");
  registerPluginCommand(program);
  await program.parseAsync(["node", "aidd", "plugin", ...args]);
  return written.join("").split("\n").slice(0, -1);
}

describe("aidd plugin — the group with no subcommand", () => {
  it("offers the five things a person can do, then re-runs itself with the pick", async () => {
    pretendTerminal(true);

    await run();

    expect(menuSelect).toHaveBeenCalledWith("plugin: what do you want to do?", [
      { name: "Install plugin", value: "install" },
      { name: "List installed plugins", value: "list" },
      { name: "Search plugins", value: "search", description: "requires query arg" },
      { name: "Update plugins", value: "update" },
      { name: "Remove a plugin", value: "remove", description: "requires name arg" },
    ]);
    expect(spawn).toHaveBeenCalledWith(["plugin", "list"]);
  });

  it("prints its own help off a terminal rather than asking a question nobody can answer", async () => {
    await expect(run()).rejects.toThrow("(outputHelp)");

    expect(written.join("").split("\n")[0]).toBe("Usage: aidd plugin [options] [command]");
    expect(menuSelect).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe("aidd plugin list", () => {
  it("sweeps every installed tool when none was named", async () => {
    expect(await run("list")).toEqual(["claude:", "  aidd-dev@1.0.0"]);
    expect(pluginList).toHaveBeenCalledWith({ toolIds: "all" });
  });

  it("narrows to the one tool that was named", async () => {
    await run("list", "--tool", "codex");

    expect(pluginList).toHaveBeenCalledWith({ toolIds: ["codex"] });
  });

  it("refuses a tool no profile declares, before any use case runs", async () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("list", "--tool", "emacs")).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      `Error: Unknown AI tool: emacs. Valid AI tools: ${AI_TOOL_IDS.join(", ")}\n`
    );
    expect(pluginList).not.toHaveBeenCalled();
  });
});

describe("aidd plugin remove", () => {
  it("removes the named plugin everywhere, re-drives activation, and says so", async () => {
    expect(await run("remove", "aidd-dev")).toEqual(["Plugin 'aidd-dev' removed."]);
    expect(pluginRemove).toHaveBeenCalledWith({
      pluginName: "aidd-dev",
      toolIds: "all",
      projectRoot: PROJECT_ROOT,
    });
    expect(activation).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      marketplaceNames: undefined,
    });
  });

  it("names a refused activation and fails the process, saying nothing was removed", async () => {
    activation.mockResolvedValue({
      binaryMissing: [],
      errors: [{ scope: "claude", message: "claude CLI refused" }],
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("remove", "aidd-dev")).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      "Warning: [claude] claude CLI refused\nError: Sync failed for: claude. See the warnings above.\n"
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(written.join("")).toBe("");
  });
});

describe("aidd plugin install", () => {
  it("hands the pick, the tools and the terminal through, and names what landed", async () => {
    expect(await run("install", "aidd-dev")).toEqual(["Installed 'aidd-dev'."]);
    expect(pluginInstall).toHaveBeenCalledWith({
      pluginArg: "aidd-dev",
      toolIds: "all",
      projectRoot: PROJECT_ROOT,
      interactive: false,
      fromMarketplace: undefined,
      token: undefined,
      yes: undefined,
      scope: undefined,
    });
    expect(activation).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      marketplaceNames: undefined,
    });
  });

  it("narrows activation to the marketplace the install was told to use", async () => {
    await run("install", "aidd-dev", "--from", "market-b");

    expect(pluginInstall).toHaveBeenCalledWith(
      expect.objectContaining({ fromMarketplace: "market-b" })
    );
    expect(activation).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      marketplaceNames: ["market-b"],
    });
  });

  it("carries the scope, the token and the auto-answer a scripted run gave", async () => {
    await run(
      "install",
      "aidd-dev",
      "--scope",
      "user",
      "--token",
      "ghp_x",
      "--yes",
      "--tool",
      "claude"
    );

    expect(pluginInstall).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "user", token: "ghp_x", yes: true, toolIds: ["claude"] })
    );
  });

  it("refuses a scope that is neither project nor user, before any use case runs", async () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("install", "aidd-dev", "--scope", "machine")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: Invalid scope 'machine'. Expected 'project' or 'user'.\n");
    expect(pluginInstall).not.toHaveBeenCalled();
  });
});

describe("aidd plugin search", () => {
  it("asks for every plugin matching the query, recommended or not", async () => {
    expect(await run("search", "dev")).toEqual(["No matches."]);
    expect(pluginSearch).toHaveBeenCalledWith({
      query: "dev",
      recommendedOnly: false,
      marketplace: undefined,
      projectRoot: PROJECT_ROOT,
    });
  });

  it("names a failed search on stderr and fails the process", async () => {
    pluginSearch.mockRejectedValue(new Error("catalog is unreachable"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("search", "dev")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: catalog is unreachable\n");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("narrows to the recommended ones of a single marketplace when asked", async () => {
    await run("search", "dev", "--recommended", "--marketplace", "market-b");

    expect(pluginSearch).toHaveBeenCalledWith({
      query: "dev",
      recommendedOnly: true,
      marketplace: "market-b",
      projectRoot: PROJECT_ROOT,
    });
  });
});

describe("aidd plugin update", () => {
  it("sweeps every plugin when none was named, and lists what moved", async () => {
    expect(await run("update")).toEqual(["Updated: aidd-dev."]);
    expect(pluginUpdate).toHaveBeenCalledWith({
      pluginNames: undefined,
      toolIds: "all",
      projectRoot: PROJECT_ROOT,
    });
    expect(activation).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      marketplaceNames: undefined,
    });
  });

  it("names a failed update on stderr and fails the process", async () => {
    pluginUpdate.mockRejectedValue(new Error("plugin source moved"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("update")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: plugin source moved\n");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("narrows to the one plugin that was named", async () => {
    await run("update", "aidd-dev");

    expect(pluginUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ pluginNames: ["aidd-dev"] })
    );
  });
});

describe("aidd plugin — how every subcommand builds its graph", () => {
  it.each([
    ["list"],
    ["remove", "aidd-dev"],
    ["install", "aidd-dev"],
    ["search", "dev"],
    ["update"],
  ])("hands %j this run's verbosity, never an empty option set", async (...args) => {
    await run(...args);

    expect(vi.mocked(createDeps)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      { verbose: false },
      expect.anything()
    );
  });
});

describe("aidd plugin — the help surface", () => {
  function pluginCommand(): Command {
    const program = new Command();
    registerPluginCommand(program);
    const plugin = program.commands.find((command) => command.name() === "plugin");
    if (plugin === undefined) throw new Error("plugin command was not registered");
    return plugin;
  }

  function optionsOf(name: string): [string, string | undefined][] {
    const child = pluginCommand().commands.find((candidate) => candidate.name() === name);
    if (child === undefined) throw new Error(`no subcommand ${name}`);
    return child.options.map((option) => [option.flags, option.description]);
  }

  it("describes the group and every subcommand, in the order they are registered", () => {
    expect(pluginCommand().description()).toBe("Manage plugins for AI tools");
    expect(
      pluginCommand().commands.map((command) => [
        command.name(),
        command.usage(),
        command.description(),
      ])
    ).toEqual([
      ["remove", "[options] <name>", "Remove a plugin from one or all AI tools"],
      ["list", "[options]", "List installed plugins for one or all AI tools"],
      [
        "install",
        "[options] [plugin]",
        "Install a plugin (marketplace name, local path, or interactive pick)",
      ],
      ["search", "[options] <query>", "Search registered marketplaces for plugins"],
      ["update", "[options] [name]", "Update one or all plugins for one or all AI tools"],
    ]);
  });

  it("offers the same tool narrowing to remove, list and update", () => {
    const tool: [string, string][] = [
      ["--tool <toolId>", "Target AI tool (default: all installed)"],
    ];

    expect(optionsOf("remove")).toEqual(tool);
    expect(optionsOf("list")).toEqual(tool);
    expect(optionsOf("update")).toEqual(tool);
  });

  it("says what install may be told about the source, the scope and the prompts", () => {
    expect(optionsOf("install")).toEqual([
      ["--from <market>", "Marketplace name (when multiple match)"],
      ["--tool <toolId>", "Target AI tool (default: all installed)"],
      ["--token <value>", "Auth token (host detected from source URL at fetch time)"],
      ["--scope <user|project>", "Install scope; must match the tool's supported scope"],
      ["--yes", "Auto-resolve interactive prompts (CI mode)"],
    ]);
  });

  it("says how a search may be narrowed", () => {
    expect(optionsOf("search")).toEqual([
      ["--recommended", "Show only recommended plugins"],
      ["--marketplace <name>", "Limit to a single marketplace"],
    ]);
  });
});

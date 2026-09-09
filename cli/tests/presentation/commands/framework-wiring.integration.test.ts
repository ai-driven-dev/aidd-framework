import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VALID_TOOL_IDS } from "../../../src/kernel/tool.js";

const installAiTool = vi.fn();
const installIdeTool = vi.fn();
const uninstallAiTools = vi.fn();
const uninstallIdeTool = vi.fn();
const updateAiTools = vi.fn();
const updateIdeTools = vi.fn();
const listInstalledRules = vi.fn();
const loadManifest = vi.fn();
const currentVersion = vi.fn(() => "5.2.2");

vi.mock("../../../src/runtime/wiring/framework.js", () => ({
  createDeps: vi.fn(async () => ({
    installAiToolUseCase: { execute: installAiTool },
    installIdeToolUseCase: { execute: installIdeTool },
    uninstallUseCase: { execute: uninstallAiTools },
    uninstallIdeUseCase: { execute: uninstallIdeTool },
    updateAiToolsUseCase: { execute: updateAiTools },
    updateIdeToolsUseCase: { execute: updateIdeTools },
    listInstalledRulesUseCase: { execute: listInstalledRules },
    manifestRepo: { load: loadManifest },
    currentVersionProvider: { get: currentVersion },
  })),
  createMenuDeps: vi.fn(),
}));

const { createDeps } = await import("../../../src/runtime/wiring/framework.js");
const { registerFrameworkCommand } = await import(
  "../../../src/presentation/commands/framework.js"
);

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
  currentVersion.mockReturnValue("5.2.2");
  installAiTool.mockResolvedValue({
    runtimeResult: { skipped: false, fileCount: 5, warnings: [] },
    propagationWarnings: [],
    activation: undefined,
  });
  installIdeTool.mockResolvedValue({
    skipped: false,
    toolId: "vscode",
    fileCount: 2,
    warnings: [],
  });
  uninstallAiTools.mockResolvedValue([{ toolId: "claude", fileCount: 4 }]);
  uninstallIdeTool.mockResolvedValue({ toolId: "vscode", fileCount: 1 });
  updateAiTools.mockResolvedValue({ updatedTools: [], errors: [] });
  updateIdeTools.mockResolvedValue({ updatedTools: [], errors: [] });
  listInstalledRules.mockResolvedValue({ rules: [] });
  loadManifest.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

async function run(...args: string[]): Promise<string[]> {
  const program = new Command();
  program.exitOverride();
  program.option("--verbose");
  registerFrameworkCommand(program);
  await program.parseAsync(["node", "aidd", "framework", ...args]);
  return written.join("").split("\n").slice(0, -1);
}

describe("aidd framework install", () => {
  it("installs an AI tool at the version the graph reports, plugins carried along", async () => {
    expect(await run("install", "--tool", "claude")).toEqual(["Installed claude (5 files)"]);
    expect(installAiTool).toHaveBeenCalledWith({
      toolId: "claude",
      projectRoot: PROJECT_ROOT,
      force: false,
      version: "5.2.2",
      propagatePlugins: true,
    });
    expect(installIdeTool).not.toHaveBeenCalled();
  });

  it("leaves the already-installed alone, and names the flag that would redo it", async () => {
    installAiTool.mockResolvedValue({
      runtimeResult: { skipped: true, fileCount: 0, warnings: [] },
      propagationWarnings: [],
    });

    expect(await run("install", "--tool", "claude")).toEqual([]);
    expect(errors.join("")).toBe(
      "Warning: claude is already installed. Use `--force` to reinstall.\n"
    );
  });

  it("prints the runtime's own warnings before the propagation's, then the count", async () => {
    installAiTool.mockResolvedValue({
      runtimeResult: { skipped: false, fileCount: 5, warnings: ["merged settings.json"] },
      propagationWarnings: ["aidd-dev was not propagated"],
    });

    expect(await run("install", "--tool", "claude")).toEqual(["Installed claude (5 files)"]);
    expect(errors.join("")).toBe(
      "Warning: merged settings.json\nWarning: aidd-dev was not propagated\n"
    );
  });

  it("carries an overwrite and a refused propagation through", async () => {
    await run("install", "--tool", "claude", "--force", "--no-plugins");

    expect(installAiTool).toHaveBeenCalledWith(
      expect.objectContaining({ force: true, propagatePlugins: false })
    );
  });

  it("reports the activation an install already drove, and fails on a refusal", async () => {
    installAiTool.mockResolvedValue({
      runtimeResult: { skipped: false, fileCount: 5, warnings: [] },
      propagationWarnings: [],
      activation: { errors: [{ scope: "claude", message: "claude CLI refused" }] },
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("install", "--tool", "claude")).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      "Warning: [claude] claude CLI refused\nError: Sync failed for: claude. See the warnings above.\n"
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("sends an IDE tool down its own install, with the manifest it loaded", async () => {
    expect(await run("install", "--tool", "vscode")).toEqual(["Installed vscode (2 files)"]);
    expect(installIdeTool).toHaveBeenCalledWith({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
      manifest: expect.anything(),
      force: false,
      version: "5.2.2",
    });
    expect(installAiTool).not.toHaveBeenCalled();
  });

  it("leaves an already-installed IDE tool alone too", async () => {
    installIdeTool.mockResolvedValue({
      skipped: true,
      toolId: "vscode",
      fileCount: 0,
      warnings: [],
    });

    expect(await run("install", "--tool", "vscode")).toEqual([]);
    expect(errors.join("")).toBe(
      "Warning: vscode is already installed. Use `--force` to reinstall.\n"
    );
  });

  it("refuses a tool neither category declares, and lists every one it would have taken", async () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("install", "--tool", "emacs")).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      `Error: Unknown tool: emacs. Valid tools: ${VALID_TOOL_IDS.join(", ")}\n`
    );
    expect(installAiTool).not.toHaveBeenCalled();
  });
});

describe("aidd framework remove", () => {
  it("removes one AI tool with no MCP narrowing, and counts every file that went", async () => {
    uninstallAiTools.mockResolvedValue([
      { toolId: "claude", fileCount: 4 },
      { toolId: "claude", fileCount: 3 },
    ]);

    expect(await run("remove", "--tool", "claude")).toEqual(["Removed claude (7 files removed)"]);
    expect(uninstallAiTools).toHaveBeenCalledWith({
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
      mcpFilter: [],
    });
    expect(uninstallIdeTool).not.toHaveBeenCalled();
  });

  it("names a failed removal on stderr and fails the process", async () => {
    uninstallAiTools.mockRejectedValue(new Error("manifest is locked"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("remove", "--tool", "claude")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: manifest is locked\n");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("sends an IDE tool down its own removal", async () => {
    expect(await run("remove", "--tool", "vscode")).toEqual(["Removed vscode (1 files removed)"]);
    expect(uninstallIdeTool).toHaveBeenCalledWith({
      toolId: "vscode",
      projectRoot: PROJECT_ROOT,
    });
    expect(uninstallAiTools).not.toHaveBeenCalled();
  });
});

describe("aidd framework update", () => {
  it("fans out across both categories when no tool was named", async () => {
    updateAiTools.mockResolvedValue({
      updatedTools: [{ toolId: "claude", fileCount: 5 }],
      errors: [],
    });
    updateIdeTools.mockResolvedValue({
      updatedTools: [{ toolId: "vscode", fileCount: 2 }],
      errors: [{ scope: "vscode", message: "one file was kept" }],
    });

    expect(await run("update")).toEqual(["Updated claude (5 files)", "Updated vscode (2 files)"]);
    expect(updateAiTools).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      userForce: false,
      interactive: false,
    });
    expect(updateIdeTools).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      userForce: false,
      interactive: false,
    });
    expect(errors.join("")).toBe("Warning: [vscode] one file was kept\n");
  });

  it("says nothing is installed when neither category moved and neither failed", async () => {
    expect(await run("update")).toEqual(["No tools installed."]);
  });

  it("narrows to the one AI tool named, leaving the IDE sweep unrun", async () => {
    await run("update", "--tool", "claude", "--force");

    expect(updateAiTools).toHaveBeenCalledWith({
      toolArg: "claude",
      projectRoot: PROJECT_ROOT,
      userForce: true,
      interactive: false,
    });
    expect(updateIdeTools).not.toHaveBeenCalled();
  });

  it("narrows to the one IDE tool named, leaving the AI sweep unrun", async () => {
    await run("update", "--tool", "vscode");

    expect(updateIdeTools).toHaveBeenCalledWith({
      toolArg: "vscode",
      projectRoot: PROJECT_ROOT,
      userForce: false,
      interactive: false,
    });
    expect(updateAiTools).not.toHaveBeenCalled();
  });

  it("names a failed update on stderr and fails the process", async () => {
    updateAiTools.mockRejectedValue(new Error("bundled assets are missing"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("update")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: bundled assets are missing\n");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("tells the update a terminal is watching", async () => {
    pretendTerminal(true);

    await run("update");

    expect(updateAiTools).toHaveBeenCalledWith(expect.objectContaining({ interactive: true }));
  });

  it("treats a stream that says nothing about being a terminal as none", async () => {
    Object.defineProperty(process.stdout, "isTTY", { value: undefined, configurable: true });

    await run("update");

    expect(updateAiTools).toHaveBeenCalledWith(expect.objectContaining({ interactive: false }));
  });

  it("refuses a tool it does not know before asking either updater", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("update", "--tool", "nope")).rejects.toThrow("exited");

    expect(errors[0]).toBe(
      `Error: Unknown tool: nope. Valid tools: ${VALID_TOOL_IDS.join(", ")}\n`
    );
    expect(updateAiTools).not.toHaveBeenCalled();
    expect(updateIdeTools).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd framework rules", () => {
  it("reads this project's rules and says so when there are none", async () => {
    expect(await run("rules")).toEqual(["No rules installed for any AI tool."]);
    expect(listInstalledRules).toHaveBeenCalledWith({ projectRoot: PROJECT_ROOT });
  });

  it("prints the inventory as text a person reads", async () => {
    listInstalledRules.mockResolvedValue({
      rules: [{ tool: "claude", path: ".claude/rules/a.md", description: "", paths: undefined }],
    });

    expect(await run("rules")).toEqual([
      "claude  .claude/rules/a.md",
      "  (no description)",
      "  applies to: every file",
    ]);
  });

  it("prints the same inventory as the JSON a program reads", async () => {
    const rules = [
      { tool: "claude", path: ".claude/rules/a.md", description: "a rule", paths: ["src/**"] },
    ];
    listInstalledRules.mockResolvedValue({ rules });

    expect((await run("rules", "--json")).join("\n")).toBe(JSON.stringify(rules, null, 2));
  });
});

describe("aidd framework — how every subcommand builds its graph and reports a failure", () => {
  it.each([["install", "--tool", "claude"], ["remove", "--tool", "claude"], ["update"], ["rules"]])(
    "hands %j this run's verbosity, never an empty option set",
    async (...args) => {
      await run(...args);

      expect(vi.mocked(createDeps)).toHaveBeenCalledWith(
        PROJECT_ROOT,
        { verbose: false },
        expect.anything()
      );
    }
  );

  it("names a failed rules read on stderr and fails the process", async () => {
    listInstalledRules.mockRejectedValue(new Error("manifest unreadable"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("rules")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: manifest unreadable\n");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd framework — the help surface", () => {
  function frameworkCommand(): Command {
    const program = new Command();
    registerFrameworkCommand(program);
    const framework = program.commands.find((command) => command.name() === "framework");
    if (framework === undefined) throw new Error("framework command was not registered");
    return framework;
  }

  function optionsOf(name: string): [string, string | undefined, boolean][] {
    const child = frameworkCommand().commands.find((candidate) => candidate.name() === name);
    if (child === undefined) throw new Error(`no subcommand ${name}`);
    return child.options.map((option) => [option.flags, option.description, option.mandatory]);
  }

  it("describes the group and every subcommand against the command it is confused with", () => {
    expect(frameworkCommand().description()).toBe(
      "Manage the framework's lifecycle on installed tools"
    );
    expect(
      frameworkCommand().commands.map((command) => [command.name(), command.description()])
    ).toEqual([
      [
        "install",
        "Install a tool's runtime configuration from bundled assets — acts on the framework alone (see `setup`, which bootstraps the whole project)",
      ],
      [
        "remove",
        "Remove a tool's generated configuration files — removes the framework only (see `clean`, which removes all of AIDD)",
      ],
      [
        "update",
        "Re-install tool configs from bundled CLI assets, moving to a new version (all installed tools if --tool is omitted; see `marketplace refresh`, which re-fetches catalogs instead)",
      ],
      ["rules", "List the rules installed in this project, across every AI tool"],
    ]);
  });

  it("requires a tool of install and remove, and leaves it optional on update", () => {
    expect(optionsOf("install")).toEqual([
      ["--tool <tool>", "AI or IDE tool ID", true],
      ["-f, --force", "Overwrite already-installed tool", false],
      ["--no-plugins", "Skip propagation of already-installed plugins onto the new tool", false],
    ]);
    expect(optionsOf("remove")).toEqual([["--tool <tool>", "AI or IDE tool ID", true]]);
    expect(optionsOf("update")).toEqual([
      ["--tool <tool>", "Limit update to a specific AI or IDE tool", false],
      ["-f, --force", "Overwrite modified files without prompting", false],
    ]);
    expect(optionsOf("rules")).toEqual([["--json", "Print the inventory as JSON", false]]);
  });
});

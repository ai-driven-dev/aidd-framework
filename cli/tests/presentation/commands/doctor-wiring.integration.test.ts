import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import { userMachineLocalFilesOf } from "../../../src/contexts/tools/domain/registry.js";

const doctorAll = vi.fn();
const statusAll = vi.fn();
const doctorScoped = vi.fn();
const statusScoped = vi.fn();
const doctorRegistration = vi.fn();
const loadUserManifest = vi.fn();
const homedir = vi.fn(() => "/home/dev");

vi.mock("../../../src/runtime/wiring/framework.js", () => ({
  createDeps: vi.fn(async () => ({
    doctorAllUseCase: { execute: doctorAll },
    statusAllUseCase: { execute: statusAll },
    doctorUseCase: { execute: doctorScoped },
    statusUseCase: { execute: statusScoped },
    doctorRegistrationUseCase: { execute: doctorRegistration },
    userManifestRepo: { load: loadUserManifest },
    homedir,
    environment: { get: () => undefined, set: () => undefined },
  })),
  createMenuDeps: vi.fn(),
}));

const { createDeps } = await import("../../../src/runtime/wiring/framework.js");
const { registerDoctorCommand } = await import("../../../src/presentation/commands/doctor.js");

const PROJECT_ROOT = process.cwd();

const HEALTHY_SCOPE = { toolHealth: [], issues: [] };

let written: string[] = [];
let errors: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  written = [];
  errors = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    errors.push(String(chunk));
    return true;
  });
  homedir.mockReturnValue("/home/dev");
  doctorAll.mockResolvedValue({
    errors: [],
    ai: HEALTHY_SCOPE,
    ide: HEALTHY_SCOPE,
    pluginIssues: [],
    healthy: true,
  });
  statusAll.mockResolvedValue({
    aiTools: { tools: [] },
    ideTools: { tools: [] },
    pluginDrift: [],
  });
  doctorScoped.mockResolvedValue({
    toolHealth: [],
    issues: [],
    pluginIssues: [],
    healthy: true,
  });
  statusScoped.mockResolvedValue({ tools: [], pluginDrift: [] });
  doctorRegistration.mockResolvedValue([]);
  loadUserManifest.mockResolvedValue({
    getInstalledToolIds: () => ["claude"],
    getToolVersion: () => "5.2.2",
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
  registerDoctorCommand(program);
  await program.parseAsync(["node", "aidd", "doctor", ...args]);
  return written.join("").split("\n").slice(0, -1);
}

describe("aidd doctor — every tool at once", () => {
  it("reports drift for both categories, then calls a clean install healthy", async () => {
    expect(await run()).toEqual([
      "",
      "Drift:",
      "AI tools:",
      "  (none installed)",
      "IDE tools:",
      "  (none installed)",
      "Plugins:",
      "  (all in sync)",
      "",
      "Installation is healthy",
    ]);
    expect(doctorAll).toHaveBeenCalledWith(PROJECT_ROOT, undefined);
    expect(statusAll).toHaveBeenCalledWith(PROJECT_ROOT);
  });

  it("names each equipped tool with its version and what it carries", async () => {
    doctorAll.mockResolvedValue({
      errors: [],
      ai: { toolHealth: [{ toolId: "claude", fileCount: 12, mergeFileCount: 1 }], issues: [] },
      ide: HEALTHY_SCOPE,
      pluginIssues: [],
      healthy: true,
    });
    statusAll.mockResolvedValue({
      aiTools: { tools: [{ toolId: "claude", version: "5.2.2", drifted: [] }] },
      ideTools: { tools: [] },
      pluginDrift: [],
    });

    expect(await run()).toEqual([
      "",
      "AI tools:",
      "  claude (v5.2.2): 12 files, 1 merge files",
      "",
      "Drift:",
      "AI tools:",
      "  claude (v5.2.2): in sync",
      "IDE tools:",
      "  (none installed)",
      "Plugins:",
      "  (all in sync)",
      "",
      "Installation is healthy",
    ]);
  });

  it("surfaces the report's own errors before anything it could measure", async () => {
    doctorAll.mockResolvedValue({
      errors: [{ scope: "claude", message: "settings.json is unreadable" }],
      ai: HEALTHY_SCOPE,
      ide: HEALTHY_SCOPE,
      pluginIssues: [],
      healthy: true,
    });

    await run();

    expect(errors.join("")).toBe("Warning: [claude] settings.json is unreadable\n");
  });

  it("fails the process on an unhealthy install rather than calling it healthy", async () => {
    doctorAll.mockResolvedValue({
      errors: [],
      ai: {
        toolHealth: [],
        issues: [{ severity: "error", message: "claude is not registered", fix: "aidd sync" }],
      },
      ide: HEALTHY_SCOPE,
      pluginIssues: [],
      healthy: false,
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run()).rejects.toThrow("exited");

    expect(errors[0]).toBe("Error:   claude is not registered\n    Fix: aidd sync\n");
    expect(written.join("")).not.toContain("healthy");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("narrows the health gate to the named plugin, and holds its scope issues back", async () => {
    doctorAll.mockResolvedValue({
      errors: [],
      ai: {
        toolHealth: [],
        issues: [{ severity: "error", message: "claude is not registered", fix: "aidd sync" }],
      },
      ide: HEALTHY_SCOPE,
      pluginIssues: [],
      healthy: false,
    });

    const lines = await run("--plugin", "aidd-dev");

    expect(doctorAll).toHaveBeenCalledWith(PROJECT_ROOT, "aidd-dev");
    expect(errors.join("")).toBe("");
    expect(lines[lines.length - 1]).toBe("Installation is healthy");
  });

  it("fails when the named plugin is the thing that is broken", async () => {
    doctorAll.mockResolvedValue({
      errors: [],
      ai: HEALTHY_SCOPE,
      ide: HEALTHY_SCOPE,
      pluginIssues: [
        {
          pluginName: "aidd-dev",
          toolId: "claude",
          issue: "drifted",
          filePath: ".claude/a.md",
        },
      ],
      healthy: true,
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--plugin", "aidd-dev")).rejects.toThrow("exited");

    expect(errors[0]).toBe(
      "Error:   Plugin aidd-dev (claude): drifted — .claude/a.md\n    Fix: Run `aidd sync`\n"
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd doctor — the two categories, told apart", () => {
  it("labels each category's inventory and its issues by that category's own name", async () => {
    doctorAll.mockResolvedValue({
      errors: [],
      ai: {
        toolHealth: [{ toolId: "claude", fileCount: 1, mergeFileCount: 0 }],
        issues: [{ severity: "info", message: "claude has never run", fix: "run claude" }],
      },
      ide: {
        toolHealth: [{ toolId: "vscode", fileCount: 2, mergeFileCount: 0 }],
        issues: [{ severity: "info", message: "vscode has never run", fix: "run vscode" }],
      },
      pluginIssues: [],
      healthy: true,
    });

    expect(await run()).toEqual([
      "",
      "AI tools:",
      "  claude (vunknown): 1 files, 0 merge files",
      "",
      "IDE tools:",
      "  vscode (vunknown): 2 files, 0 merge files",
      "",
      "Drift:",
      "AI tools:",
      "  (none installed)",
      "IDE tools:",
      "  (none installed)",
      "Plugins:",
      "  (all in sync)",
      "",
      "AI:",
      "",
      "IDE:",
      "",
      "Installation is healthy",
    ]);
    expect(errors.join("")).toBe(
      "Warning:   claude has never run\n    Fix: run claude\n" +
        "Warning:   vscode has never run\n    Fix: run vscode\n"
    );
  });
});

describe("aidd doctor --tool", () => {
  it("asks the category the tool belongs to, then narrows the inventory to that tool", async () => {
    doctorScoped.mockResolvedValue({
      toolHealth: [
        { toolId: "claude", fileCount: 12, mergeFileCount: 1 },
        { toolId: "codex", fileCount: 9, mergeFileCount: 0 },
      ],
      issues: [],
      pluginIssues: [],
      healthy: true,
    });
    statusScoped.mockResolvedValue({
      tools: [{ toolId: "claude", version: "5.2.2", drifted: [] }],
      pluginDrift: [],
    });

    expect(await run("--tool", "claude")).toEqual([
      "",
      "claude tools:",
      "  claude (v5.2.2): 12 files, 1 merge files",
      "",
      "Drift:",
      "  claude (v5.2.2): in sync",
      "Plugins:",
      "  (all in sync)",
      "",
      "Installation is healthy",
    ]);
    expect(doctorScoped).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      category: "ai",
      pluginName: undefined,
    });
    expect(statusScoped).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      filterToolId: "claude",
      pluginName: undefined,
    });
    expect(doctorAll).not.toHaveBeenCalled();
  });

  it("calls an IDE tool an IDE tool when it asks its category", async () => {
    await run("--tool", "vscode");

    expect(doctorScoped).toHaveBeenCalledWith(expect.objectContaining({ category: "ide" }));
  });

  it("carries the named plugin into both reads", async () => {
    await run("--tool", "claude", "--plugin", "aidd-dev");

    expect(doctorScoped).toHaveBeenCalledWith(expect.objectContaining({ pluginName: "aidd-dev" }));
    expect(statusScoped).toHaveBeenCalledWith(expect.objectContaining({ pluginName: "aidd-dev" }));
  });

  it("names that tool's own scope issues when no plugin narrows the run", async () => {
    doctorScoped.mockResolvedValue({
      toolHealth: [],
      issues: [{ severity: "error", message: "claude is not registered", fix: "aidd sync" }],
      pluginIssues: [],
      healthy: false,
    });
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--tool", "claude")).rejects.toThrow("exited");

    expect(errors[0]).toBe("Error:   claude is not registered\n    Fix: aidd sync\n");
  });

  it("fails the process when that one tool's category is unhealthy", async () => {
    doctorScoped.mockResolvedValue({
      toolHealth: [],
      issues: [],
      pluginIssues: [],
      healthy: false,
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--tool", "claude")).rejects.toThrow("exited");

    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd doctor --tool with a plugin named", () => {
  it("holds that tool's scope issues back, and gates on the plugin alone", async () => {
    doctorScoped.mockResolvedValue({
      toolHealth: [],
      issues: [{ severity: "error", message: "claude is not registered", fix: "aidd sync" }],
      pluginIssues: [],
      healthy: false,
    });

    const lines = await run("--tool", "claude", "--plugin", "aidd-dev");

    expect(errors.join("")).toBe("");
    expect(lines[lines.length - 1]).toBe("Installation is healthy");
  });

  it("fails when that one plugin is the thing that is broken", async () => {
    doctorScoped.mockResolvedValue({
      toolHealth: [],
      issues: [],
      pluginIssues: [
        { pluginName: "aidd-dev", toolId: "claude", issue: "not-installed-on-machine" },
      ],
      healthy: true,
    });
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--tool", "claude", "--plugin", "aidd-dev")).rejects.toThrow("exited");

    expect(errors[0]).toBe(
      "Error:   claude: plugins not installed on this machine, run `aidd sync`\n"
    );
  });
});

describe("aidd doctor --scope user", () => {
  it("reads the machine-wide manifest and checks registrations alone", async () => {
    expect(await run("--scope", "user")).toEqual([
      "User-scope tools:",
      `  claude (v5.2.2): expects activation in ${userMachineLocalFilesOf("claude", "/home/dev", () => undefined)[0]}`,
      "",
      "User-scope installation is healthy",
    ]);
    expect(doctorRegistration).toHaveBeenCalledWith({
      manifest: expect.anything(),
      projectRoot: PROJECT_ROOT,
      allowedIds: null,
    });
    expect(doctorAll).not.toHaveBeenCalled();
  });

  it("narrows the registration check to the one tool named", async () => {
    await run("--scope", "user", "--tool", "claude");

    expect(doctorRegistration.mock.calls[0][0].allowedIds).toEqual(new Set(["claude"]));
  });

  it("points at setup when nothing was ever registered machine-wide", async () => {
    loadUserManifest.mockResolvedValue(null);

    expect(await run("--scope", "user")).toEqual([
      "Nothing registered at user scope yet — run `aidd setup --scope user` first.",
    ]);
    expect(doctorRegistration).not.toHaveBeenCalled();
  });

  it("refuses a plugin filter user scope tracks nothing to narrow", async () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--scope", "user", "--plugin", "aidd-dev")).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      "Error: --scope user tracks nothing --plugin can narrow — it names every requested tool, " +
        "not one plugin or one file. Drop --plugin, or run `aidd doctor --plugin <name>` at project scope.\n"
    );
    expect(loadUserManifest).not.toHaveBeenCalled();
  });

  it("fails the process on a registration error, and stays quiet about health", async () => {
    doctorRegistration.mockResolvedValue([
      { severity: "error", message: "claude is not registered", fix: "aidd sync" },
    ]);
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--scope", "user")).rejects.toThrow("exited");

    expect(errors[0]).toBe("Error:   claude is not registered\n    Fix: aidd sync\n");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("refuses a scope it does not know before building anything", async () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--scope", "machine")).rejects.toThrow("exited");

    expect(errors[0]).toBe('Error: Invalid --scope "machine" — expected "project" or "user".\n');
    expect(doctorAll).not.toHaveBeenCalled();
  });
});

describe("aidd doctor --scope user — what a tool without user-scope settings reports", () => {
  it("names the tool asked for, and says so when it has no user-scope settings file", async () => {
    loadUserManifest.mockResolvedValue({
      getInstalledToolIds: () => ["claude"],
      getToolVersion: () => undefined,
    });

    expect(await run("--scope", "user", "--tool", "cursor")).toEqual([
      "User-scope tools:",
      "  cursor (vunknown): expects activation in no user-scope settings file",
      "",
      "User-scope installation is healthy",
    ]);
  });

  it("names a warning under its own heading, and still calls the machine healthy", async () => {
    doctorRegistration.mockResolvedValue([
      { severity: "warning", message: "claude is ahead of this aidd", fix: "aidd update" },
    ]);

    const lines = await run("--scope", "user");

    expect(lines).toContain("User scope:");
    expect(errors.join("")).toBe("Warning:   claude is ahead of this aidd\n    Fix: aidd update\n");
    expect(lines[lines.length - 1]).toBe("User-scope installation is healthy");
  });
});

describe("aidd doctor — how it builds its graph and reports a failure", () => {
  it("builds the graph for this project at this run's verbosity", async () => {
    await run("--verbose");

    expect(vi.mocked(createDeps)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      { verbose: true },
      expect.anything()
    );
  });

  it("names a failed read on stderr and fails the process", async () => {
    doctorAll.mockRejectedValue(new Error("manifest unreadable"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run()).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: manifest unreadable\n");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd doctor — the help surface", () => {
  function doctorCommand(): Command {
    const program = new Command();
    registerDoctorCommand(program);
    const doctor = program.commands.find((command) => command.name() === "doctor");
    if (doctor === undefined) throw new Error("doctor command was not registered");
    return doctor;
  }

  it("describes itself by what it reports on", () => {
    expect(doctorCommand().description()).toBe(
      "Detected and equipped tools, plugins, drift, and problems — across all tools or one"
    );
  });

  it("offers a tool, a plugin and a scope narrowing, and asks nothing else", () => {
    expect(doctorCommand().options.map((option) => [option.flags, option.description])).toEqual([
      ["--tool <tool>", "Limit to a specific AI or IDE tool"],
      ["--plugin <name>", "Limit plugin checks to a specific plugin"],
      [
        "--scope <scope>",
        "project (default) checks this project's own manifest; user checks the " +
          "machine-wide manifest --scope user setup wrote",
      ],
    ]);
  });
});

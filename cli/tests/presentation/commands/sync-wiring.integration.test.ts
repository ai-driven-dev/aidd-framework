import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const restoreAll = vi.fn();
const restoreOne = vi.fn();
const activation = vi.fn();
const loadManifest = vi.fn();
const getToolVersion = vi.fn();
const currentVersion = vi.fn();
const userManifestRepo = { load: vi.fn() };

vi.mock("../../../src/runtime/wiring/framework.js", () => ({
  createDeps: vi.fn(async () => ({
    restoreAllUseCase: { execute: restoreAll },
    restoreUseCase: { execute: restoreOne },
    marketplaceSyncSettingsUseCase: { execute: activation },
    manifestRepo: { load: loadManifest },
    userManifestRepo,
    currentVersionProvider: { get: currentVersion },
  })),
  createMenuDeps: vi.fn(),
}));

const { createDeps } = await import("../../../src/runtime/wiring/framework.js");
const { registerSyncCommand } = await import("../../../src/presentation/commands/sync.js");

const PROJECT_ROOT = process.cwd();

const NOTHING_RESTORED = {
  errors: [],
  totalRestored: 0,
  totalKept: 0,
  pluginNamesRestored: [],
  unrestorable: [],
};

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
  restoreAll.mockResolvedValue(NOTHING_RESTORED);
  restoreOne.mockResolvedValue({
    tools: [{ nothingToRestore: true }],
    totalRestored: 0,
    totalKept: 0,
    unrestorable: [],
  });
  activation.mockResolvedValue({ binaryMissing: [], errors: [], activated: [] });
  getToolVersion.mockReturnValue("5.1.0");
  loadManifest.mockResolvedValue({ getToolVersion });
  currentVersion.mockReturnValue("5.2.2");
  userManifestRepo.load.mockResolvedValue({ getInstalledToolIds: () => ["claude"] });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

async function run(...args: string[]): Promise<string[]> {
  const program = new Command();
  program.exitOverride();
  program.option("--verbose");
  registerSyncCommand(program);
  await program.parseAsync(["node", "aidd", "sync", ...args]);
  return written.join("").split("\n").slice(0, -1);
}

describe("aidd sync — the whole project", () => {
  it("restores first, then re-drives every registered marketplace's activation", async () => {
    expect(await run()).toEqual(["Nothing to restore — all files are unmodified."]);
    expect(restoreAll).toHaveBeenCalledWith(PROJECT_ROOT, false, false);
    expect(activation).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      recreateFrameworkIfMissing: true,
    });
    expect(restoreAll.mock.invocationCallOrder[0]).toBeLessThan(
      activation.mock.invocationCallOrder[0]
    );
  });

  it("prompts on a terminal, and stops prompting once the run was forced", async () => {
    pretendTerminal(true);

    await run();
    expect(restoreAll).toHaveBeenCalledWith(PROJECT_ROOT, false, true);

    await run("--force");
    expect(restoreAll).toHaveBeenLastCalledWith(PROJECT_ROOT, true, false);
  });

  it("names both the restoration's and the activation's refusals, and fails the process", async () => {
    restoreAll.mockResolvedValue({
      ...NOTHING_RESTORED,
      errors: [{ scope: "claude", message: "file is not ours" }],
    });
    activation.mockResolvedValue({
      binaryMissing: [],
      errors: [{ scope: "codex", message: "codex CLI refused" }],
      activated: [],
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run()).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      "Warning: [claude] file is not ours\n" +
        "Warning: [codex] codex CLI refused\n" +
        "Error: Sync failed for: claude, codex. See the warnings above.\n"
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("warns about a binary off PATH without failing the run", async () => {
    activation.mockResolvedValue({
      binaryMissing: [{ toolId: "claude", binary: "claude" }],
      errors: [],
      activated: [],
    });

    await run();

    expect(errors.join("")).toBe(
      "Warning: claude: the plugin will not load until the claude CLI has run.\n"
    );
  });
});

describe("aidd sync --tool", () => {
  it("restores that tool at the version the manifest recorded, then activates it alone", async () => {
    expect(await run("--tool", "claude")).toEqual([
      "Nothing to restore — all files are unmodified.",
    ]);
    expect(restoreOne).toHaveBeenCalledWith({
      version: "5.1.0",
      projectRoot: PROJECT_ROOT,
      toolIds: ["claude"],
      files: undefined,
      force: false,
      interactive: false,
      manifest: expect.anything(),
      pluginName: undefined,
    });
    expect(activation).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      toolIds: ["claude"],
      recreateFrameworkIfMissing: true,
    });
    expect(restoreAll).not.toHaveBeenCalled();
  });

  it("falls back to this CLI's own version when the manifest records none for that tool", async () => {
    getToolVersion.mockReturnValue(undefined);

    await run("--tool", "claude");

    expect(restoreOne).toHaveBeenCalledWith(expect.objectContaining({ version: "5.2.2" }));
  });

  it("narrows to the files and the plugin that were named", async () => {
    await run("--tool", "claude", "--plugin", "aidd-dev", "a.md", "b.md");

    expect(restoreOne).toHaveBeenCalledWith(
      expect.objectContaining({ files: ["a.md", "b.md"], pluginName: "aidd-dev" })
    );
  });

  it("refuses to restore anything when this project has no manifest", async () => {
    loadManifest.mockResolvedValue(null);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--tool", "claude")).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      "Error: No AIDD manifest found. Run `aidd setup` to initialize your project.\n"
    );
    expect(restoreOne).not.toHaveBeenCalled();
  });
});

describe("aidd sync --tool — a refused activation", () => {
  it("names the refusal and fails the process rather than calling one tool synced", async () => {
    activation.mockResolvedValue({
      binaryMissing: [],
      errors: [{ scope: "claude", message: "claude CLI refused" }],
      activated: [],
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--tool", "claude")).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      "Warning: [claude] claude CLI refused\n" +
        "Error: Sync failed for: claude. See the warnings above.\n"
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd sync --scope user", () => {
  it("drives activation off the machine-wide manifest and restores no project file", async () => {
    activation.mockResolvedValue({ binaryMissing: [], errors: [], activated: ["claude"] });

    expect(await run("--scope", "user")).toEqual(["Synced native activation for: claude"]);
    expect(activation).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      scope: "user",
      manifestRepo: userManifestRepo,
      toolIds: undefined,
      recreateFrameworkIfMissing: true,
    });
    expect(restoreAll).not.toHaveBeenCalled();
    expect(restoreOne).not.toHaveBeenCalled();
  });

  it("says nothing is registered at user scope when activation touched no tool", async () => {
    expect(await run("--scope", "user")).toEqual([
      "Nothing to sync — no tool is registered at user scope yet.",
    ]);
  });

  it("narrows to the one tool named, still off the machine-wide manifest", async () => {
    await run("--scope", "user", "--tool", "claude");

    expect(activation).toHaveBeenCalledWith(expect.objectContaining({ toolIds: ["claude"] }));
  });

  it("refuses a plugin filter it tracks nothing to narrow", async () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--scope", "user", "--plugin", "aidd-dev")).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      "Error: --scope user tracks nothing --plugin can narrow — it names every requested tool, " +
        "not one plugin or one file. Drop --plugin, or run `aidd sync --plugin <name>` at project scope.\n"
    );
    expect(activation).not.toHaveBeenCalled();
  });

  it("refuses a file argument it tracks nothing to narrow", async () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--scope", "user", "a.md")).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      "Error: --scope user tracks nothing a file argument can narrow — it names every requested tool, " +
        "not one plugin or one file. Drop a file argument, or run `aidd sync <files...>` at project scope.\n"
    );
    expect(activation).not.toHaveBeenCalled();
  });

  it("names a refused user-scope activation and fails before reporting success", async () => {
    activation.mockResolvedValue({
      binaryMissing: [],
      errors: [{ scope: "claude", message: "claude CLI refused" }],
      activated: ["claude"],
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--scope", "user")).rejects.toThrow("exited");

    expect(written.join("")).toBe("");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("refuses a scope it does not know before building anything", async () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("--scope", "machine")).rejects.toThrow("exited");

    expect(errors[0]).toBe('Error: Invalid --scope "machine" — expected "project" or "user".\n');
  });
});

describe("aidd sync — how it builds its graph", () => {
  it("builds the graph for this project at this run's verbosity", async () => {
    await run("--verbose");

    expect(vi.mocked(createDeps)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      { verbose: true },
      expect.anything()
    );
  });
});

describe("aidd sync — the help surface", () => {
  function syncCommand(): Command {
    const program = new Command();
    registerSyncCommand(program);
    const sync = program.commands.find((command) => command.name() === "sync");
    if (sync === undefined) throw new Error("sync command was not registered");
    return sync;
  }

  it("describes itself against the command that records nothing", () => {
    expect(syncCommand().description()).toBe(
      "Rewrite owned files from what is already there — regenerate tracked files, driven by the manifest (see `translate`, which converts a source without recording anything)"
    );
  });

  it("takes any number of tracked files, none of them required", () => {
    expect(
      syncCommand().registeredArguments.map((argument) => [
        argument.name(),
        argument.required,
        argument.variadic,
        argument.description,
      ])
    ).toEqual([["files", false, true, "Limit sync to specific tracked files"]]);
  });

  it("offers a forced run and three narrowings, and asks nothing else", () => {
    expect(syncCommand().options.map((option) => [option.flags, option.description])).toEqual([
      ["-f, --force", "Sync without prompting"],
      ["--tool <tool>", "Limit sync to a specific tool"],
      ["--plugin <name>", "Limit sync to a specific plugin"],
      [
        "--scope <scope>",
        "project (default) resolves this project's own manifest; user resolves the " +
          "machine-wide manifest --scope user setup wrote, restoring no project files",
      ],
    ]);
  });
});

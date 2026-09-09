import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cleanProject = vi.fn();
const cleanUserScope = vi.fn();

vi.mock("../../../src/runtime/wiring/framework.js", () => ({
  createDeps: vi.fn(async () => ({
    cleanUseCase: { execute: cleanProject },
    cleanUserScopeUseCase: { execute: cleanUserScope },
  })),
  createMenuDeps: vi.fn(),
}));

const { createDeps } = await import("../../../src/runtime/wiring/framework.js");
const { registerCleanCommand } = await import("../../../src/presentation/commands/clean.js");

const PROJECT_ROOT = process.cwd();

const EMPTY_PREVIEW = {
  tools: [{ toolId: "claude", fileCount: 3 }],
  nativeRegistrations: [],
  totalFileCount: 3,
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
  cleanProject.mockResolvedValue({
    manifestFound: true,
    dryRun: true,
    fileCount: 0,
    preview: EMPTY_PREVIEW,
  });
  cleanUserScope.mockResolvedValue({
    dryRun: false,
    manifestFound: true,
    preview: { toolIds: [], builtVersions: [], referencingProjects: [] },
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
  registerCleanCommand(program);
  await program.parseAsync(["node", "aidd", ...args]);
  return written.join("").split("\n").slice(0, -1);
}

describe("aidd clean — the project this command was run in", () => {
  it("previews rather than removes when nothing confirmed it", async () => {
    expect(await run("clean")).toEqual([
      "The following will be removed:",
      "  claude: 3 files",
      "  manifest: .aidd/ (config.json, if present, is kept)",
      "Would remove 3 files across 1 tool. Use --force to confirm.",
    ]);
    expect(cleanProject).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: false,
    });
    expect(cleanUserScope).not.toHaveBeenCalled();
  });

  it("carries the confirmation through, and names what was removed", async () => {
    cleanProject.mockResolvedValue({
      manifestFound: true,
      dryRun: false,
      fileCount: 7,
      preview: EMPTY_PREVIEW,
    });

    expect(await run("clean", "--force")).toEqual(["Cleaned all AIDD files (7 files removed)"]);
    expect(cleanProject).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      force: true,
      interactive: false,
    });
  });

  it("tells the use case a terminal is watching, and ends the preview differently", async () => {
    pretendTerminal(true);

    const lines = await run("clean");

    expect(cleanProject).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: true,
    });
    expect(lines[lines.length - 1]).toBe("No files removed.");
  });
});

describe("aidd clean --scope", () => {
  it("sends a user scope to the machine-wide clean alone", async () => {
    expect(await run("clean", "--scope", "user")).toEqual([
      "Cleaned the shared aidd-framework source for this machine",
    ]);
    expect(cleanUserScope).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: false,
    });
    expect(cleanProject).not.toHaveBeenCalled();
  });

  it("treats a spelled-out project scope as the default one", async () => {
    await run("clean", "--scope", "project");

    expect(cleanProject).toHaveBeenCalledTimes(1);
    expect(cleanUserScope).not.toHaveBeenCalled();
  });

  it("tells the machine-wide clean a terminal is watching", async () => {
    pretendTerminal(true);
    cleanUserScope.mockResolvedValue({
      dryRun: true,
      manifestFound: true,
      preview: { toolIds: [], builtVersions: [], referencingProjects: [] },
    });

    const lines = await run("clean", "--scope", "user");

    expect(cleanUserScope).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: true,
    });
    expect(lines[lines.length - 1]).toBe("No files removed.");
  });

  it("refuses a scope it does not know before building anything", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("clean", "--scope", "machine")).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      'Error: Invalid --scope "machine" — expected "project" or "user".\n'
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(vi.mocked(createDeps)).not.toHaveBeenCalled();
  });
});

describe("aidd clean — how it builds its graph and reports a failure", () => {
  it("builds the graph for this project at this run's verbosity", async () => {
    await run("clean");

    expect(vi.mocked(createDeps)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      { verbose: false },
      expect.anything()
    );
  });

  it("names the failure on stderr and fails the process", async () => {
    cleanProject.mockRejectedValue(new Error("registry locked"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("clean")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: registry locked\n");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd clean — the help surface", () => {
  function cleanCommand(): Command {
    const program = new Command();
    registerCleanCommand(program);
    const clean = program.commands.find((command) => command.name() === "clean");
    if (clean === undefined) throw new Error("clean command was not registered");
    return clean;
  }

  it("describes itself against the command it is confused with", () => {
    expect(cleanCommand().description()).toBe(
      "Remove all AIDD-managed files from the project — retires every part of AIDD; see `framework remove`, which removes the framework only"
    );
  });

  it("offers a confirmation and a scope, and asks nothing else", () => {
    expect(cleanCommand().options.map((option) => [option.flags, option.description])).toEqual([
      ["--force", "Confirm file removal (skip dry-run)"],
      [
        "--scope <scope>",
        "project (default) cleans this project alone; user undoes the machine-wide " +
          "registration setup --scope user wrote and purges the shared source itself",
      ],
    ]);
  });
});

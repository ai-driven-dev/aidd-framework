import { resolve } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import "../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import { supportedBuildTargets } from "../../../src/contexts/translate/domain/build-target.js";

const build = vi.fn();
let buildUseCase: { execute: typeof build } | undefined;

vi.mock("../../../src/runtime/wiring/framework.js", () => ({
  createDeps: vi.fn(async () => ({ fs: {}, assetProvider: {}, logger: {} })),
  createMenuDeps: vi.fn(),
}));

vi.mock("../../../src/runtime/wiring/translate.js", () => ({
  createFrameworkBuildUseCase: vi.fn(() => buildUseCase),
}));

const { createDeps } = await import("../../../src/runtime/wiring/framework.js");
const { createFrameworkBuildUseCase } = await import("../../../src/runtime/wiring/translate.js");
const { registerTranslateCommand } = await import(
  "../../../src/presentation/commands/translate.js"
);

const PROJECT_ROOT = process.cwd();
const SOURCE_DIR = resolve(PROJECT_ROOT, "framework");
const OUT_DIR = resolve(PROJECT_ROOT, "dist-plugins");

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
  buildUseCase = { execute: build };
  build.mockResolvedValue({ plugins: ["a", "b"], totalFiles: 12, outDir: OUT_DIR });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

async function run(...args: string[]): Promise<string[]> {
  const program = new Command();
  program.exitOverride();
  program.option("--verbose");
  registerTranslateCommand(program);
  await program.parseAsync(["node", "aidd", ...args]);
  return written.join("").split("\n").slice(0, -1);
}

describe("aidd translate — what it hands the build", () => {
  it("resolves both directories against the project and builds a marketplace tree", async () => {
    expect(await run("translate", "framework", "--to", "claude", "--out", "dist-plugins")).toEqual([
      `Built 2 plugins, 12 files written to ${OUT_DIR}`,
    ]);
    expect(vi.mocked(createFrameworkBuildUseCase)).toHaveBeenCalledWith(expect.anything(), {
      target: "claude",
      mode: "marketplace",
      outDir: OUT_DIR,
      force: false,
    });
    expect(build).toHaveBeenCalledWith({
      sourceDir: SOURCE_DIR,
      outDir: OUT_DIR,
      target: "claude",
      mode: "marketplace",
    });
  });

  it("carries a flat layout into both the factory and the build, and says so", async () => {
    expect(
      await run("translate", "framework", "--to", "claude", "--out", "dist-plugins", "--as", "flat")
    ).toEqual([`Flat-installed 2 plugins, 12 files written under ${OUT_DIR}`]);
    expect(vi.mocked(createFrameworkBuildUseCase)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: "flat" })
    );
    expect(build).toHaveBeenCalledWith(expect.objectContaining({ mode: "flat" }));
  });

  it("carries an overwrite through to the factory alone", async () => {
    await run("translate", "framework", "--to", "claude", "--out", "dist-plugins", "--force");

    expect(vi.mocked(createFrameworkBuildUseCase)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ force: true })
    );
  });

  it("builds the graph for this project at this run's verbosity", async () => {
    await run("--verbose", "translate", "framework", "--to", "claude", "--out", "dist-plugins");

    expect(vi.mocked(createDeps)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      { verbose: true },
      expect.anything()
    );
  });
});

describe("aidd translate — what it refuses", () => {
  it("refuses a target no profile declares, and lists the ones that do", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(
      run("translate", "framework", "--to", "emacs", "--out", "dist-plugins")
    ).rejects.toThrow("exited");

    expect(errors.join("")).toBe(
      `Error: Unsupported target 'emacs'. Supported targets: ${supportedBuildTargets().join(", ")}.\n`
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(vi.mocked(createDeps)).not.toHaveBeenCalled();
  });

  it("refuses a layout that is neither marketplace nor flat", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(
      run("translate", "framework", "--to", "claude", "--out", "dist-plugins", "--as", "zip")
    ).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: Invalid --as 'zip'. Expected 'marketplace' or 'flat'.\n");
    expect(exit).toHaveBeenCalledWith(1);
    expect(vi.mocked(createDeps)).not.toHaveBeenCalled();
  });

  it("names the target and layout together when no strategy pairs them", async () => {
    buildUseCase = undefined;
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(
      run("translate", "framework", "--to", "claude", "--out", "dist-plugins", "--as", "flat")
    ).rejects.toThrow("exited");

    expect(errors[0]).toBe("Error: Unsupported target/mode combination: claude (flat).\n");
    expect(exit).toHaveBeenCalledWith(1);
    expect(build).not.toHaveBeenCalled();
  });

  it("names a failed build on stderr and fails the process", async () => {
    build.mockRejectedValue(new Error("source directory is empty"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(
      run("translate", "framework", "--to", "claude", "--out", "dist-plugins")
    ).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: source directory is empty\n");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd translate — the help surface", () => {
  function translateCommand(): Command {
    const program = new Command();
    registerTranslateCommand(program);
    const translate = program.commands.find((command) => command.name() === "translate");
    if (translate === undefined) throw new Error("translate command was not registered");
    return translate;
  }

  it("describes itself against the command that records what it writes", () => {
    expect(translateCommand().description()).toBe(
      "Convert an arbitrary source into a target-native plugin tree — records nothing (see `sync` for the manifest-driven, tracked version)"
    );
  });

  it("takes one required source, named for what it points at", () => {
    expect(
      translateCommand().registeredArguments.map((argument) => [
        argument.name(),
        argument.required,
        argument.description,
      ])
    ).toEqual([["source", true, "Path to the source framework directory"]]);
  });

  it("requires a target and an output directory, and defaults the layout", () => {
    expect(
      translateCommand().options.map((option) => [
        option.flags,
        option.description,
        option.defaultValue,
      ])
    ).toEqual([
      ["--to <target>", "Conversion target (claude, cursor, copilot, codex, opencode)", undefined],
      ["--out <dir>", "Output directory (marketplace dist or project root)", undefined],
      ["--as <marketplace|flat>", "Output layout", "marketplace"],
      ["--force", "Overwrite existing files at canonical paths under --out", undefined],
    ]);
    expect(
      translateCommand()
        .options.filter((option) => option.mandatory)
        .map((option) => option.long)
    ).toEqual(["--to", "--out"]);
  });
});

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

const loadManifest = vi.fn();
const promptSelect = vi.fn();
const promptConfirm = vi.fn();
const promptInput = vi.fn();
const spawn = vi.fn();
const question = vi.fn();
const close = vi.fn();

vi.mock("../../../src/runtime/wiring/framework.js", () => ({
  createDeps: vi.fn(),
  createMenuDeps: vi.fn(() => ({
    manifestRepo: { load: loadManifest },
    prompter: { select: promptSelect, confirm: promptConfirm, input: promptInput },
  })),
}));

vi.mock("../../../src/presentation/commands/spawn-cli-command.js", () => ({
  spawnCliCommand: spawn,
}));

vi.mock("node:readline", () => ({
  default: { createInterface: vi.fn(() => ({ question, close })) },
}));

const { createMenuDeps } = await import("../../../src/runtime/wiring/framework.js");
const { runMenuLoop } = await import("../../../src/presentation/commands/menu.js");
const { resolveProjectRoot } = await import("../../../src/runtime/project-root/project-root.js");

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
  question.mockImplementation((_prompt: string, callback: () => void) => {
    callback();
  });
  loadManifest.mockResolvedValue(null);
  promptConfirm.mockResolvedValue(false);
  spawn.mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

/** The loop only ever ends by exiting the process, so the spy has to unwind it. */
function exiting(): MockInstance<typeof process.exit> {
  return vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`exit ${String(code)}`);
  });
}

async function loopUntilExit(): Promise<void> {
  await expect(runMenuLoop()).rejects.toThrow(/^exit /);
}

describe("aidd with no argument — the menu loop", () => {
  it("greets with the banner, built off the project the process was started in", async () => {
    exiting();

    await loopUntilExit();

    expect(written[0].split("\n").at(-2)).toBe(" AI-Driven Development CLI");
    expect(vi.mocked(createMenuDeps)).toHaveBeenCalledWith(resolveProjectRoot());
  });

  it("leaves without running anything when the menu answers exit", async () => {
    const exit = exiting();

    await loopUntilExit();

    expect(exit.mock.calls[0]).toEqual([0]);
    expect(spawn).not.toHaveBeenCalled();
    expect(question).not.toHaveBeenCalled();
  });

  it("waits for a keypress after a command, so its output can be read", async () => {
    promptConfirm.mockResolvedValueOnce(true).mockResolvedValue(false);
    exiting();

    await loopUntilExit();

    expect(spawn).toHaveBeenCalledWith(["setup"]);
    expect(question.mock.calls[0][0]).toBe("\nPress ENTER to continue...");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("carries a failed setup's own exit code out of the loop", async () => {
    promptConfirm.mockResolvedValue(true);
    spawn.mockResolvedValue(3);
    const exit = exiting();

    await loopUntilExit();

    expect(exit.mock.calls[0]).toEqual([3]);
  });

  it("keeps offering the menu after a setup that succeeded", async () => {
    promptConfirm.mockResolvedValueOnce(true).mockResolvedValue(false);
    spawn.mockResolvedValue(0);
    const exit = exiting();

    await loopUntilExit();

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(promptConfirm).toHaveBeenCalledTimes(2);
    expect(exit.mock.calls[0]).toEqual([0]);
  });

  it("keeps offering the menu after any other command failed", async () => {
    loadManifest.mockResolvedValue({});
    promptSelect
      .mockResolvedValueOnce("maintain")
      .mockResolvedValueOnce("sync-all")
      .mockResolvedValue("exit");
    spawn.mockResolvedValue(1);
    const exit = exiting();

    await loopUntilExit();

    expect(spawn).toHaveBeenCalledWith(["sync"]);
    expect(exit.mock.calls[0]).toEqual([0]);
  });

  it("leaves quietly when the person aborts a prompt with Ctrl-C", async () => {
    promptConfirm.mockRejectedValue(
      Object.assign(new Error("prompt aborted"), { name: "ExitPromptError" })
    );
    const exit = exiting();

    await loopUntilExit();

    expect(exit.mock.calls[0]).toEqual([0]);
    expect(errors).toEqual([]);
  });

  it("reports any other failure through the error handler, and fails the process", async () => {
    promptConfirm.mockRejectedValue(new Error("prompter is broken"));
    const exit = exiting();

    await loopUntilExit();

    expect(errors).toEqual(["Error: prompter is broken\n"]);
    expect(exit.mock.calls[0]).toEqual([1]);
  });
});

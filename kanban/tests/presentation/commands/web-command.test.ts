import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KanbanRuntime } from "../../../src/composition/kanban-runtime.js";

vi.mock("node:child_process", () => ({ exec: vi.fn() }));

const { registerWebCommand } = await import("../../../src/presentation/commands/web-command.js");

function createRuntime(): {
  runtime: KanbanRuntime;
  startMock: ReturnType<typeof vi.fn>;
  stopMock: ReturnType<typeof vi.fn>;
  createWebServerMock: ReturnType<typeof vi.fn>;
} {
  const startMock = vi.fn().mockResolvedValue(4321);
  const stopMock = vi.fn();
  const createWebServerMock = vi.fn(() => ({ start: startMock, stop: stopMock }));

  const runtime = {
    createWebServer: createWebServerMock,
    output: { print: vi.fn() },
    projectPath: "/resolved/project/path",
  } as unknown as KanbanRuntime;

  return { runtime, startMock, stopMock, createWebServerMock };
}

describe("web command wiring", () => {
  const errors: unknown[] = [];

  beforeEach(() => {
    errors.length = 0;
  });

  it("exposes the --port option", () => {
    const program = new Command();

    registerWebCommand(program, createRuntime().runtime, (error) => errors.push(error));

    expect(program.options.map((option) => option.long)).toContain("--port");
  });

  it("builds the server for the requested port from the runtime and starts it", async () => {
    const { runtime, startMock, createWebServerMock } = createRuntime();
    const program = new Command();
    registerWebCommand(program, runtime, (error) => errors.push(error));

    await program.parseAsync(["node", "aidd-kanban", "--port", "8080"]);
    await Promise.resolve();

    expect(createWebServerMock).toHaveBeenCalledWith(8080, {
      projectPath: "/resolved/project/path",
      pinned: false,
    });
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });

  it("defaults to port 3000 when the flag is omitted", async () => {
    const { runtime, createWebServerMock } = createRuntime();
    const program = new Command();
    registerWebCommand(program, runtime, (error) => errors.push(error));

    await program.parseAsync(["node", "aidd-kanban"]);
    await Promise.resolve();

    expect(createWebServerMock).toHaveBeenCalledWith(3000, {
      projectPath: "/resolved/project/path",
      pinned: false,
    });
  });

  it("pins the path from the positional argument and hides the picker", async () => {
    const { runtime, createWebServerMock } = createRuntime();
    const program = new Command();
    registerWebCommand(program, runtime, (error) => errors.push(error));

    await program.parseAsync(["node", "aidd-kanban", "/some/dir"]);
    await Promise.resolve();

    expect(createWebServerMock).toHaveBeenCalledWith(3000, {
      projectPath: "/some/dir",
      pinned: true,
    });
  });

  it("routes a non-numeric port to the error handler without starting a server", async () => {
    const { runtime, startMock, createWebServerMock } = createRuntime();
    const program = new Command();
    registerWebCommand(program, runtime, (error) => errors.push(error));

    await program.parseAsync(["node", "aidd-kanban", "--port", "abc"]);
    await Promise.resolve();

    expect(createWebServerMock).not.toHaveBeenCalled();
    expect(startMock).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toContain("KANBAN_INVALID_PORT");
  });
});

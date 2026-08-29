import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListTaskDocumentsUseCase } from "../../../src/application/use-cases/list-task-documents.js";
import type { KanbanRuntime } from "../../../src/composition/kanban-runtime.js";
import type { TaskDocumentWatcher } from "../../../src/domain/ports/task-document-watcher.js";

const { constructorSpy, startMock, stopMock } = vi.hoisted(() => ({
  constructorSpy: vi.fn(),
  startMock: vi.fn().mockResolvedValue(4321),
  stopMock: vi.fn(),
}));

vi.mock("../../../src/presentation/web/http-server.js", () => ({
  KanbanWebServer: class {
    start = startMock;
    stop = stopMock;
    constructor(config: unknown) {
      constructorSpy(config);
    }
  },
}));

vi.mock("../../../src/presentation/web/frontend-assets.js", () => ({
  FRONTEND_INDEX_HTML: "<html></html>",
  FRONTEND_STYLES_CSS: "css",
  FRONTEND_APP_JS: "js",
}));

vi.mock("node:child_process", () => ({ exec: vi.fn() }));

const { registerWebCommand } = await import("../../../src/presentation/commands/web-command.js");

function createWatcher(): TaskDocumentWatcher {
  return { start: vi.fn(), stop: vi.fn(), onChange: vi.fn() };
}

function createRuntime(): KanbanRuntime {
  return {
    listTaskDocuments: new ListTaskDocumentsUseCase({ findAll: async () => [] }),
    createWatcher: createWatcher,
    output: { print: vi.fn() },
    projectPath: "/resolved/project/path",
  };
}

function lastServerConfig(): Record<string, unknown> {
  const call = constructorSpy.mock.calls.at(-1);
  return (call?.[0] ?? {}) as Record<string, unknown>;
}

describe("web command wiring", () => {
  const errors: unknown[] = [];

  beforeEach(() => {
    constructorSpy.mockClear();
    startMock.mockClear().mockResolvedValue(4321);
    stopMock.mockClear();
    errors.length = 0;
  });

  it("exposes the --port option and an optional [path] argument", () => {
    const program = new Command();

    registerWebCommand(program, createRuntime(), (error) => errors.push(error));

    expect(program.options.map((option) => option.long)).toContain("--port");
    expect(program.registeredArguments.map((argument) => argument.name())).toEqual(["path"]);
  });

  it("builds the server from the runtime collaborators and starts it", async () => {
    const runtime = createRuntime();
    const program = new Command();
    registerWebCommand(program, runtime, (error) => errors.push(error));

    await program.parseAsync(["node", "aidd-kanban"]);
    await Promise.resolve();

    const config = lastServerConfig();
    expect(config.projectPath).toBe("/resolved/project/path");
    expect(config.useCase).toBe(runtime.listTaskDocuments);
    expect(config.output).toBe(runtime.output);
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });

  it("defaults the project path to the runtime path and overrides it with the argument", async () => {
    const program = new Command();
    registerWebCommand(program, createRuntime(), (error) => errors.push(error));

    await program.parseAsync(["node", "aidd-kanban", "/explicit/path"]);
    await Promise.resolve();

    expect(lastServerConfig().projectPath).toBe("/explicit/path");
  });
});

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOCS_DIRECTORY_NAME } from "../helpers/docs-directory.js";
import { createTestKanbanDeps } from "../helpers/test-deps.js";

vi.mock("../../src/infrastructure/http/frontend-assets.js", () => ({
  readFrontendAssets: () => ({ indexHtml: "<html></html>", stylesCss: "", appJs: "" }),
}));

const { createKanbanRuntime } = await import("../../src/composition/kanban-runtime.js");

describe("kanban runtime", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "aidd-kanban-runtime-"));
    const taskDirectory = join(projectPath, DOCS_DIRECTORY_NAME, "task-a");
    await mkdir(taskDirectory, { recursive: true });
    await writeFile(
      join(taskDirectory, "plan.md"),
      ["---", "name: FID-560", "type: plan", "status: pending", "---", ""].join("\n")
    );
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it("wires a use case that lists the project's task documents", async () => {
    const runtime = createKanbanRuntime({ deps: createTestKanbanDeps(), projectPath });

    const board = await runtime.listTaskDocuments.execute(projectPath, {});

    const parentNames = board.columns.flatMap((column) =>
      column.taskGroups.map((taskGroup) => taskGroup.parent.name)
    );
    expect(parentNames).toEqual(["FID-560"]);
  });

  it("hands out a fresh watcher instance on every call", () => {
    const runtime = createKanbanRuntime({ deps: createTestKanbanDeps(), projectPath });

    expect(runtime.createWatcher()).not.toBe(runtime.createWatcher());
  });

  it("carries the project path it was built with", () => {
    const runtime = createKanbanRuntime({ deps: createTestKanbanDeps(), projectPath });

    expect(runtime.projectPath).toBe(projectPath);
  });

  it("serves the project board as a DTO over the web server it builds", async () => {
    const runtime = createKanbanRuntime({ deps: createTestKanbanDeps(), projectPath });
    const server = runtime.createWebServer(0, { projectPath, pinned: false });
    const actualPort = await server.start();

    try {
      const response = await fetch(`http://localhost:${actualPort}/api/tasks`);
      const board = (await response.json()) as {
        columns: { cards: { name: string }[] }[];
      };
      const cardNames = board.columns.flatMap((column) => column.cards.map((card) => card.name));

      expect(response.status).toBe(200);
      expect(cardNames).toEqual(["FID-560"]);
    } finally {
      server.stop();
    }
  });

  it("switches the served project when a valid path is posted to /api/project", async () => {
    const otherProject = await mkdtemp(join(tmpdir(), "aidd-kanban-runtime-other-"));
    const otherTask = join(otherProject, DOCS_DIRECTORY_NAME, "task-b");
    await mkdir(otherTask, { recursive: true });
    await writeFile(
      join(otherTask, "plan.md"),
      ["---", "name: FID-999", "type: plan", "status: done", "---", ""].join("\n")
    );

    const runtime = createKanbanRuntime({ deps: createTestKanbanDeps(), projectPath });
    const server = runtime.createWebServer(0, { projectPath, pinned: false });
    const actualPort = await server.start();

    try {
      const switchResponse = await fetch(`http://localhost:${actualPort}/api/project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: otherProject }),
      });
      expect(switchResponse.status).toBe(200);

      const board = (await (await fetch(`http://localhost:${actualPort}/api/tasks`)).json()) as {
        columns: { cards: { name: string }[] }[];
      };
      const cardNames = board.columns.flatMap((column) => column.cards.map((card) => card.name));
      expect(cardNames).toEqual(["FID-999"]);
    } finally {
      server.stop();
      await rm(otherProject, { recursive: true, force: true });
    }
  });

  it("rejects a posted path that is not a project", async () => {
    const notAProject = await mkdtemp(join(tmpdir(), "aidd-kanban-runtime-empty-"));

    const runtime = createKanbanRuntime({ deps: createTestKanbanDeps(), projectPath });
    const server = runtime.createWebServer(0, { projectPath, pinned: false });
    const actualPort = await server.start();

    try {
      const response = await fetch(`http://localhost:${actualPort}/api/project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: notAProject }),
      });
      expect(response.status).toBe(400);
      expect((await response.json()) as { code: string }).toMatchObject({
        code: "KANBAN_PROJECT_NOT_FOUND",
      });
    } finally {
      server.stop();
      await rm(notAProject, { recursive: true, force: true });
    }
  });
});

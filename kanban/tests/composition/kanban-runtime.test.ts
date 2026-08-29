import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKanbanRuntime } from "../../src/composition/kanban-runtime.js";
import { DOCS_DIRECTORY_NAME } from "../helpers/docs-directory.js";
import { createTestKanbanDeps } from "../helpers/test-deps.js";

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
});

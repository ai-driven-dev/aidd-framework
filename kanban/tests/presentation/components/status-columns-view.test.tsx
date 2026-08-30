import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  type ListTaskDocumentsFilters,
  ListTaskDocumentsUseCase,
} from "../../../src/application/use-cases/list-task-documents.js";
import { createKanbanRuntime } from "../../../src/composition/kanban-runtime.js";
import { UNKNOWN_DOCUMENT_STATUS } from "../../../src/domain/models/document-status.js";
import type { ProgressStatus } from "../../../src/domain/models/progress-status.js";
import type { TaskDocument } from "../../../src/domain/models/task-document.js";
import { StatusColumnsView } from "../../../src/presentation/components/status-columns-view.js";
import { DOCS_DIRECTORY_NAME } from "../../helpers/docs-directory.js";
import { createTestKanbanDeps } from "../../helpers/test-deps.js";

interface TaskDocumentOverrides {
  name: string;
  filePath: string;
  type?: string;
  status?: string;
  progressStatus?: ProgressStatus;
}

function createTaskDocument({
  name,
  filePath,
  type = "plan",
  status = "pending",
  progressStatus = "todo",
}: TaskDocumentOverrides): TaskDocument {
  return { name, description: "", type, status, progressStatus, filePath };
}

function createUseCase(taskDocuments: TaskDocument[]): ListTaskDocumentsUseCase {
  return new ListTaskDocumentsUseCase({
    findAll: async () => taskDocuments,
    projectExists: async () => true,
  });
}

async function waitForFrame(
  lastFrame: () => string | undefined,
  expectedText: string
): Promise<string> {
  await vi.waitFor(() => {
    expect(lastFrame()).toContain(expectedText);
  });

  const frame = lastFrame();
  return frame === undefined ? "" : frame;
}

function renderView(
  listTaskDocuments: ListTaskDocumentsUseCase,
  filters: ListTaskDocumentsFilters,
  terminalWidth: number
) {
  return render(
    createElement(StatusColumnsView, {
      listTaskDocuments,
      projectPath: "/virtual/project",
      filters,
      terminalWidth,
    })
  );
}

const NO_FILTERS: ListTaskDocumentsFilters = {};

describe("StatusColumnsView", () => {
  it("places each parent under its fixed board column, sub-documents nested beneath their parent", async () => {
    const useCase = createUseCase([
      createTaskDocument({ name: "FID-560", filePath: "/p/task-a/plan.md", status: "pending" }),
      createTaskDocument({
        name: "Phase 1",
        filePath: "/p/task-a/phase-1.md",
        type: "phase",
        status: "blocked",
        progressStatus: "blocked",
      }),
      createTaskDocument({
        name: "SPEC-001",
        filePath: "/p/task-b/spec.md",
        type: "spec",
        status: "completed",
        progressStatus: "unknown",
      }),
    ]);

    const { lastFrame, unmount } = renderView(useCase, NO_FILTERS, 140);

    const frame = await waitForFrame(lastFrame, "SPEC-001");
    expect(frame).toContain("TODO");
    expect(frame).toContain("UNKNOWN");
    expect(frame).toContain("FID-560");
    expect(frame).toContain("- Phase 1: blocked");

    unmount();
  });

  it("keeps status header and parent name legible when narrowing the simulated terminal width", async () => {
    const useCase = createUseCase([
      createTaskDocument({ name: "FID-560", filePath: "/p/task-a/plan.md", status: "pending" }),
      createTaskDocument({
        name: "Phase 1",
        filePath: "/p/task-a/phase-1.md",
        type: "phase",
        status: "blocked",
        progressStatus: "blocked",
      }),
    ]);

    const { lastFrame, unmount } = renderView(useCase, NO_FILTERS, 20);

    const frame = await waitForFrame(lastFrame, "FID-560");
    expect(frame).toContain("TODO");
    expect(frame).toContain("FID-560");
    expect(frame).not.toContain("- Phase 1: blocked");

    unmount();
  });

  it("hides a document whose parent status is unknown by default, but shows it when shouldIncludeUnknownStatus is true", async () => {
    const taskDocuments = [
      createTaskDocument({
        name: "SPEC-001",
        filePath: "/p/task-a/spec.md",
        type: "spec",
        status: UNKNOWN_DOCUMENT_STATUS,
        progressStatus: "unknown",
      }),
      createTaskDocument({ name: "FID-560", filePath: "/p/task-b/plan.md", status: "pending" }),
    ];

    const { lastFrame, unmount } = renderView(createUseCase(taskDocuments), NO_FILTERS, 100);
    const frame = await waitForFrame(lastFrame, "FID-560");
    expect(frame).not.toContain("SPEC-001");
    unmount();

    const withAll = renderView(
      createUseCase(taskDocuments),
      { shouldIncludeUnknownStatus: true },
      100
    );
    const frameWithAll = await waitForFrame(withAll.lastFrame, "SPEC-001");
    expect(frameWithAll).toContain("SPEC-001");
    withAll.unmount();
  });

  it("fetches the board exactly once from the injected use case", async () => {
    const useCase = createUseCase([
      createTaskDocument({ name: "FID-560", filePath: "/p/task-a/plan.md", status: "pending" }),
    ]);
    const executeSpy = vi.spyOn(useCase, "execute");

    const { lastFrame, unmount } = renderView(useCase, NO_FILTERS, 100);
    await waitForFrame(lastFrame, "FID-560");

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith("/virtual/project", NO_FILTERS);

    unmount();
  });

  it("renders the same board a filesystem-backed use case produces for the fixture project", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "aidd-kanban-view-fs-"));
    await mkdir(join(projectPath, DOCS_DIRECTORY_NAME, "task-fixture"), { recursive: true });
    await writeFile(
      join(projectPath, DOCS_DIRECTORY_NAME, "task-fixture", "plan.md"),
      ["---", "name: Test name", "type: plan", "status: completed", "---", ""].join("\n")
    );

    const runtime = createKanbanRuntime({ deps: createTestKanbanDeps(), projectPath });
    const { lastFrame, unmount } = render(
      createElement(StatusColumnsView, {
        listTaskDocuments: runtime.listTaskDocuments,
        projectPath: runtime.projectPath,
        terminalWidth: 100,
      })
    );

    const frame = await waitForFrame(lastFrame, "Test name");
    expect(frame).toContain("Test name");
    expect(frame).toContain("UNKNOWN");

    unmount();
    await rm(projectPath, { recursive: true, force: true });
  });
});

import { describe, expect, it } from "vitest";
import { ListTaskDocumentsUseCase } from "../../src/application/use-cases/list-task-documents.js";
import type { TaskDocument } from "../../src/domain/models/task-document.js";
import type { TaskDocumentRepository } from "../../src/domain/ports/task-document-repository.js";

const PLAN_DOCUMENT: TaskDocument = {
  name: "FID-560",
  description: "plan one",
  type: "plan",
  status: "pending",
  progressStatus: "todo",
  filePath: "/project/aidd_docs/fid-560/plan.md",
};

const PLAN_PHASE_DOCUMENT: TaskDocument = {
  name: "Phase 1",
  description: "phase one",
  type: "unknown",
  status: "blocked",
  progressStatus: "blocked",
  filePath: "/project/aidd_docs/fid-560/phase-1.md",
};

const MASTER_PLAN_DOCUMENT: TaskDocument = {
  name: "FID-559",
  description: "master plan",
  type: "master_plan",
  status: "in-progress",
  progressStatus: "in-progress",
  filePath: "/project/aidd_docs/fid-559/master-plan.md",
};

const DECISION_DOCUMENT: TaskDocument = {
  name: "DEC-002",
  description: "a decision",
  type: "decision",
  status: "blocked",
  progressStatus: "blocked",
  filePath: "/project/aidd_docs/dec-002/decision.md",
};

const UNKNOWN_STATUS_DOCUMENT: TaskDocument = {
  name: "spec",
  description: "a spec with no status",
  type: "spec",
  status: "unknown",
  progressStatus: "unknown",
  filePath: "/project/aidd_docs/spec/spec.md",
};

const FIXED_TASK_DOCUMENTS: TaskDocument[] = [
  PLAN_DOCUMENT,
  PLAN_PHASE_DOCUMENT,
  MASTER_PLAN_DOCUMENT,
  DECISION_DOCUMENT,
];

function createFakeRepository(taskDocuments: TaskDocument[]): TaskDocumentRepository {
  return {
    findAll: async () => taskDocuments,
  };
}

describe("ListTaskDocumentsUseCase", () => {
  it("returns one TaskGroup per directory, each carrying its own subDocuments", async () => {
    const useCase = new ListTaskDocumentsUseCase(createFakeRepository(FIXED_TASK_DOCUMENTS));

    const result = await useCase.execute("/project", {});

    expect(result).toHaveLength(3);
    const planGroup = result.find((taskGroup) => taskGroup.parent === PLAN_DOCUMENT);
    expect(planGroup?.subDocuments).toEqual([PLAN_PHASE_DOCUMENT]);
  });

  it("returns only groups whose parent matches the type filter", async () => {
    const useCase = new ListTaskDocumentsUseCase(createFakeRepository(FIXED_TASK_DOCUMENTS));

    const result = await useCase.execute("/project", { type: "plan" });

    expect(result).toEqual([{ parent: PLAN_DOCUMENT, subDocuments: [PLAN_PHASE_DOCUMENT] }]);
  });

  it("excludes a group whose parent status does not match, even when a sub-document would", async () => {
    const useCase = new ListTaskDocumentsUseCase(createFakeRepository(FIXED_TASK_DOCUMENTS));

    const result = await useCase.execute("/project", { status: "blocked" });

    expect(result).toEqual([{ parent: DECISION_DOCUMENT, subDocuments: [] }]);
  });

  it("returns every group unchanged when no filters are supplied", async () => {
    const useCase = new ListTaskDocumentsUseCase(createFakeRepository(FIXED_TASK_DOCUMENTS));

    const result = await useCase.execute("/project", {});

    expect(result.map((taskGroup) => taskGroup.parent)).toEqual([
      PLAN_DOCUMENT,
      MASTER_PLAN_DOCUMENT,
      DECISION_DOCUMENT,
    ]);
  });

  it("still narrows by the parent's normalized progress bucket", async () => {
    const useCase = new ListTaskDocumentsUseCase(createFakeRepository(FIXED_TASK_DOCUMENTS));

    const result = await useCase.execute("/project", { progress: "blocked" });

    expect(result).toEqual([{ parent: DECISION_DOCUMENT, subDocuments: [] }]);
  });

  it("combines the progress filter with the type filter", async () => {
    const useCase = new ListTaskDocumentsUseCase(createFakeRepository(FIXED_TASK_DOCUMENTS));

    const result = await useCase.execute("/project", { progress: "todo", type: "master_plan" });

    expect(result).toEqual([]);
  });

  it("excludes a group whose parent has no known status by default", async () => {
    const useCase = new ListTaskDocumentsUseCase(
      createFakeRepository([...FIXED_TASK_DOCUMENTS, UNKNOWN_STATUS_DOCUMENT])
    );

    const result = await useCase.execute("/project", {});

    expect(result.map((taskGroup) => taskGroup.parent)).not.toContain(UNKNOWN_STATUS_DOCUMENT);
  });

  it("includes a group whose parent has no known status when shouldIncludeUnknownStatus is true", async () => {
    const useCase = new ListTaskDocumentsUseCase(
      createFakeRepository([...FIXED_TASK_DOCUMENTS, UNKNOWN_STATUS_DOCUMENT])
    );

    const result = await useCase.execute("/project", { shouldIncludeUnknownStatus: true });

    expect(result.map((taskGroup) => taskGroup.parent)).toContain(UNKNOWN_STATUS_DOCUMENT);
  });

  it("still applies the type filter alongside shouldIncludeUnknownStatus", async () => {
    const useCase = new ListTaskDocumentsUseCase(
      createFakeRepository([...FIXED_TASK_DOCUMENTS, UNKNOWN_STATUS_DOCUMENT])
    );

    const result = await useCase.execute("/project", {
      shouldIncludeUnknownStatus: true,
      type: "plan",
    });

    expect(result).toEqual([{ parent: PLAN_DOCUMENT, subDocuments: [PLAN_PHASE_DOCUMENT] }]);
  });
});

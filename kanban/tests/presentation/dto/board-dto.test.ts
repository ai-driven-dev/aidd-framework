import { describe, expect, it } from "vitest";
import { deriveBoard } from "../../../src/domain/models/board.js";
import type { ProgressStatus } from "../../../src/domain/models/progress-status.js";
import type { TaskDocument } from "../../../src/domain/models/task-document.js";
import type { TaskGroup } from "../../../src/domain/models/task-group.js";
import { toBoardDto } from "../../../src/presentation/dto/board-dto.js";

function createTaskDocument(
  name: string,
  progressStatus: ProgressStatus,
  relativePath: string
): TaskDocument {
  return {
    name,
    description: `${name} description`,
    type: "plan",
    status: progressStatus,
    progressStatus,
    filePath: relativePath,
  };
}

const PARENT_WITH_MIXED_SUBS: TaskGroup = {
  parent: createTaskDocument("FID-560", "in-progress", "aidd_docs/fid-560/plan.md"),
  subDocuments: [
    createTaskDocument("Phase 1", "done", "aidd_docs/fid-560/phase-1.md"),
    createTaskDocument("Phase 2", "done", "aidd_docs/fid-560/phase-2.md"),
    createTaskDocument("Phase 3", "todo", "aidd_docs/fid-560/phase-3.md"),
  ],
};

describe("toBoardDto", () => {
  it("keeps the five-column contract with labels straight from the board", () => {
    const dto = toBoardDto(deriveBoard([PARENT_WITH_MIXED_SUBS]));

    expect(dto.columns.map((column) => column.progressStatus)).toEqual([
      "todo",
      "in-progress",
      "done",
      "blocked",
    ]);
    expect(dto.columns.map((column) => column.label)).toEqual([
      "TODO",
      "IN PROGRESS",
      "DONE",
      "BLOCKED",
    ]);
  });

  it("counts done sub-documents against the total for a mixed parent card", () => {
    const dto = toBoardDto(deriveBoard([PARENT_WITH_MIXED_SUBS]));

    const card = dto.columns
      .flatMap((column) => column.cards)
      .find((each) => each.name === "FID-560");

    expect(card?.totalSubCount).toBe(3);
    expect(card?.doneSubCount).toBe(2);
  });

  it("carries the parent and sub-document relative paths through as plain strings", () => {
    const dto = toBoardDto(deriveBoard([PARENT_WITH_MIXED_SUBS]));

    const card = dto.columns
      .flatMap((column) => column.cards)
      .find((each) => each.name === "FID-560");

    expect(card?.path).toBe("aidd_docs/fid-560/plan.md");
    expect(card?.subDocuments.map((subDocument) => subDocument.path)).toEqual([
      "aidd_docs/fid-560/phase-1.md",
      "aidd_docs/fid-560/phase-2.md",
      "aidd_docs/fid-560/phase-3.md",
    ]);
  });

  it("produces a structure whose values are all serializable primitives and arrays", () => {
    const dto = toBoardDto(deriveBoard([PARENT_WITH_MIXED_SUBS]));

    expect(JSON.parse(JSON.stringify(dto))).toEqual(dto);
    const card = dto.columns.flatMap((column) => column.cards)[0];
    expect(Object.keys(card ?? {}).sort()).toEqual([
      "description",
      "doneSubCount",
      "name",
      "path",
      "progressStatus",
      "status",
      "subDocuments",
      "totalSubCount",
      "type",
    ]);
  });
});

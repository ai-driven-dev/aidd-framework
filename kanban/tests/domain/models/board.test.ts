import { describe, expect, it } from "vitest";
import { deriveBoard } from "../../../src/domain/models/board.js";
import type { ProgressStatus } from "../../../src/domain/models/progress-status.js";
import type { TaskGroup } from "../../../src/domain/models/task-group.js";

function createTaskGroup(name: string, progressStatus: ProgressStatus): TaskGroup {
  return {
    parent: {
      name,
      description: "",
      type: "plan",
      status: progressStatus,
      progressStatus,
      filePath: `aidd_docs/${name}/plan.md`,
    },
    subDocuments: [],
  };
}

describe("deriveBoard", () => {
  it("emits the four always-on columns in fixed lifecycle order with labels from the map", () => {
    const board = deriveBoard([]);

    expect(board.columns.map((column) => column.progressStatus)).toEqual([
      "todo",
      "in-progress",
      "done",
      "blocked",
    ]);
    expect(board.columns.map((column) => column.label)).toEqual([
      "TODO",
      "IN PROGRESS",
      "DONE",
      "BLOCKED",
    ]);
  });

  it("places each task group in the column matching its parent progress status", () => {
    const todoGroup = createTaskGroup("alpha", "todo");
    const doneGroup = createTaskGroup("beta", "done");

    const board = deriveBoard([doneGroup, todoGroup]);

    const columnFor = (progressStatus: ProgressStatus) =>
      board.columns.find((column) => column.progressStatus === progressStatus);
    expect(columnFor("todo")?.taskGroups).toEqual([todoGroup]);
    expect(columnFor("done")?.taskGroups).toEqual([doneGroup]);
    expect(columnFor("in-progress")?.taskGroups).toEqual([]);
    expect(columnFor("blocked")?.taskGroups).toEqual([]);
  });

  it("omits the unknown column when no task group carries an unknown progress status", () => {
    const board = deriveBoard([createTaskGroup("alpha", "todo")]);

    expect(board.columns.some((column) => column.progressStatus === "unknown")).toBe(false);
  });

  it("appends the unknown column last when at least one task group has an unknown progress status", () => {
    const unknownGroup = createTaskGroup("bogus", "unknown");

    const board = deriveBoard([unknownGroup]);

    expect(board.columns.map((column) => column.progressStatus)).toEqual([
      "todo",
      "in-progress",
      "done",
      "blocked",
      "unknown",
    ]);
    expect(board.columns.at(-1)?.taskGroups).toEqual([unknownGroup]);
  });
});

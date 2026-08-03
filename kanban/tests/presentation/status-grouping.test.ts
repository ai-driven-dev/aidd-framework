import { describe, expect, it } from "vitest";
import type { TaskDocument } from "../../src/domain/models/task-document.js";
import type { TaskGroup } from "../../src/domain/models/task-group.js";
import { collectDistinctParentStatuses } from "../../src/presentation/status-grouping.js";

function createTaskGroup(status: string): TaskGroup {
  const parent: TaskDocument = {
    name: `${status} plan`,
    description: "",
    type: "plan",
    status,
    progressStatus: "todo",
    filePath: `/project/aidd_docs/${status}/plan.md`,
  };

  return { parent, subDocuments: [] };
}

describe("collectDistinctParentStatuses", () => {
  it("orders canonical statuses as pending, in-progress, implemented regardless of encounter order", () => {
    const taskGroups = [
      createTaskGroup("in-progress"),
      createTaskGroup("implemented"),
      createTaskGroup("pending"),
    ];

    expect(collectDistinctParentStatuses(taskGroups)).toEqual([
      "pending",
      "in-progress",
      "implemented",
    ]);
  });

  it("appends a non-canonical status after every canonical status present, in first-seen order", () => {
    const taskGroups = [
      createTaskGroup("completed"),
      createTaskGroup("implemented"),
      createTaskGroup("archived"),
      createTaskGroup("pending"),
    ];

    expect(collectDistinctParentStatuses(taskGroups)).toEqual([
      "pending",
      "implemented",
      "completed",
      "archived",
    ]);
  });

  it("includes reviewed and blocked in their canonical positions", () => {
    const taskGroups = [
      createTaskGroup("blocked"),
      createTaskGroup("reviewed"),
      createTaskGroup("in-progress"),
    ];

    expect(collectDistinctParentStatuses(taskGroups)).toEqual([
      "in-progress",
      "reviewed",
      "blocked",
    ]);
  });

  it("returns an empty array for no task groups", () => {
    expect(collectDistinctParentStatuses([])).toEqual([]);
  });
});

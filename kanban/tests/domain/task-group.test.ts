import { describe, expect, it } from "vitest";
import type { TaskDocument } from "../../src/domain/models/task-document.js";
import { groupTaskDocumentsByDirectory } from "../../src/domain/models/task-group.js";

function createTaskDocument(filePath: string, name: string, status = "pending"): TaskDocument {
  return {
    name,
    description: "",
    type: "plan",
    status,
    progressStatus: "todo",
    filePath,
  };
}

describe("groupTaskDocumentsByDirectory", () => {
  it("groups a plan with its phase files into one TaskGroup, plan as parent", () => {
    const plan = createTaskDocument("/project/aidd_docs/task-a/plan.md", "Plan A");
    const phaseOne = createTaskDocument("/project/aidd_docs/task-a/phase-1.md", "Phase 1");
    const phaseTwo = createTaskDocument("/project/aidd_docs/task-a/phase-2.md", "Phase 2");

    const taskGroups = groupTaskDocumentsByDirectory([plan, phaseOne, phaseTwo]);

    expect(taskGroups).toHaveLength(1);
    expect(taskGroups[0]?.parent).toBe(plan);
    expect(taskGroups[0]?.subDocuments).toEqual([phaseOne, phaseTwo]);
  });

  it("elects the spec as parent when no plan exists yet", () => {
    const spec = createTaskDocument("/project/aidd_docs/task-b/spec.md", "Spec B");

    const taskGroups = groupTaskDocumentsByDirectory([spec]);

    expect(taskGroups).toHaveLength(1);
    expect(taskGroups[0]?.parent).toBe(spec);
    expect(taskGroups[0]?.subDocuments).toEqual([]);
  });

  it("elects the first document as parent when no recognized filename is present", () => {
    const first = createTaskDocument("/project/aidd_docs/task-c/notes.md", "Notes C");
    const second = createTaskDocument("/project/aidd_docs/task-c/decision.md", "Decision C");

    const taskGroups = groupTaskDocumentsByDirectory([first, second]);

    expect(taskGroups).toHaveLength(1);
    expect(taskGroups[0]?.parent).toBe(first);
    expect(taskGroups[0]?.subDocuments).toEqual([second]);
  });

  it("never mixes documents from different directories into the same TaskGroup", () => {
    const planA = createTaskDocument("/project/aidd_docs/task-a/plan.md", "Plan A");
    const planB = createTaskDocument("/project/aidd_docs/task-b/plan.md", "Plan B");

    const taskGroups = groupTaskDocumentsByDirectory([planA, planB]);

    expect(taskGroups).toHaveLength(2);
    const parents = taskGroups.map((taskGroup) => taskGroup.parent);
    expect(parents).toEqual(expect.arrayContaining([planA, planB]));
  });
});

import { describe, expect, it } from "vitest";
import { taskFolderPathFromIdentity } from "../../../src/domain/models/task-backlog-link.js";

describe("taskFolderPathFromIdentity — the folder a task's identity resolves to", () => {
  it("resolves a forge-style identity to its own task folder", () => {
    expect(taskFolderPathFromIdentity("2026_08/2026_08_21_cost-reporter")).toBe(
      "aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/"
    );
  });

  it("always ends with a trailing slash, so it composes with a bare file name", () => {
    const path = taskFolderPathFromIdentity("2026_09/2026_09_01_the-upward-link");
    expect(path.endsWith("/")).toBe(true);
  });
});

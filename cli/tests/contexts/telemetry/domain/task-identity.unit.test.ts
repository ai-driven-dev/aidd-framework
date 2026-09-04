import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  taskIdentitiesFromWrittenPaths,
  taskIdentityFromWrittenPath,
} from "../../../../src/contexts/telemetry/domain/task-identity.js";
import { journalFileWrites } from "../../../helpers/telemetry-journal-hook.js";

const FOLDER_TASK = "aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/plan.md";
const FILE_TASK = "aidd_docs/tasks/2026_08/2026_08_21_cost-reporter.md";

describe("taskIdentityFromWrittenPath", () => {
  it("names the task a written path belongs to, by its month and its own name", () => {
    expect(taskIdentityFromWrittenPath(FOLDER_TASK)).toBe("2026_08/2026_08_21_cost-reporter");
  });

  it("resolves a folder task and a single-file task of the same name to one identity", () => {
    // Both shapes are real tasks and one grows into the other; two identities would read as
    // two tasks and split a single piece of work's cost in half.
    expect(taskIdentityFromWrittenPath(FILE_TASK)).toBe(taskIdentityFromWrittenPath(FOLDER_TASK));
  });

  it("reaches a file nested any depth inside the task folder", () => {
    expect(
      taskIdentityFromWrittenPath("aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/notes/a/b.md")
    ).toBe("2026_08/2026_08_21_cost-reporter");
  });

  it("names no task for a path outside any task folder", () => {
    for (const path of [
      "cli/src/index.ts",
      "aidd_docs/memory/architecture.md",
      "aidd_docs/tasks/README.md",
      "aidd_docs/tasks/not_a_month/2026_08_21_cost-reporter/plan.md",
      "docs/aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/plan.md",
    ]) {
      expect(taskIdentityFromWrittenPath(path), path).toBeNull();
    }
  });

  it("names no task for the task folder itself, with nothing written inside it", () => {
    // The journal records files, never directories; a bare folder path means nothing was
    // written, and attributing on it would count a task that produced no work.
    expect(taskIdentityFromWrittenPath("aidd_docs/tasks/2026_08/2026_08_21_cost-reporter")).toBe(
      null
    );
  });

  it("names no task for a path that climbs out of the tree", () => {
    expect(taskIdentityFromWrittenPath("aidd_docs/tasks/2026_08/../../../etc/passwd")).toBeNull();
    expect(
      taskIdentityFromWrittenPath("aidd_docs/tasks/2026_08/2026_08_21_x/../../../secret.md")
    ).toBeNull();
  });

  it("resolves a task name that merely contains '..' as text, never mistaking it for a climb", () => {
    // "2026_02_10_a..b" is a name, not a path segment of exactly "..": it climbs nothing, and
    // both `file-writes.cjs` and `task-declared.cjs` journal it. Rejecting it on a bare
    // substring check would read a real, journalled declaration as though none existed.
    expect(taskIdentityFromWrittenPath("aidd_docs/tasks/2026_02/2026_02_10_a..b/spec.md")).toBe(
      "2026_02/2026_02_10_a..b"
    );
  });

  it("touches no filesystem — a string in, an identity or nothing out", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../../../src/contexts/telemetry/domain/task-identity.ts", import.meta.url)
      ),
      "utf8"
    );

    expect(source).not.toContain("node:fs");
    expect(source).not.toContain("node:path");
    // A task nobody has ever created still resolves: this answers what a path says, not
    // what exists.
    expect(taskIdentityFromWrittenPath("aidd_docs/tasks/2099_12/2099_12_31_invented/x.md")).toBe(
      "2099_12/2099_12_31_invented"
    );
  });
});

describe("taskIdentitiesFromWrittenPaths", () => {
  it("names every task a session wrote into, once each, in first-seen order", () => {
    expect(
      taskIdentitiesFromWrittenPaths([
        "aidd_docs/tasks/2026_08/b-task/plan.md",
        "aidd_docs/tasks/2026_08/a-task/spec.md",
        "aidd_docs/tasks/2026_08/b-task/phase-1.md",
      ])
    ).toEqual(["2026_08/b-task", "2026_08/a-task"]);
  });

  it("names no task for a session that wrote into none", () => {
    expect(taskIdentitiesFromWrittenPaths(["cli/src/index.ts"])).toEqual([]);
    expect(taskIdentitiesFromWrittenPaths([])).toEqual([]);
  });

  it("names a task for exactly the paths the hook journals, and for no others", () => {
    // The two live apart - hooks/ is copied verbatim by the framework build and can import
    // nothing from cli/ - so they are pinned to each other here. A derivation stricter than
    // the writer's gate would leave journalled lines resolving to nothing; a looser one
    // would invent a task from a path no session was ever recorded as writing.
    const CANDIDATES = [
      "aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/plan.md",
      "aidd_docs/tasks/2026_08/2026_08_21_cost-reporter.md",
      "aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/notes/a/b.md",
      "aidd_docs/tasks/2026_02/2026_02_10_a..b/spec.md",
      "aidd_docs/tasks/2026_08/plan.md",
      "aidd_docs/tasks/2026_08/2026_08_21_cost-reporter",
      "aidd_docs/tasks/README.md",
      "aidd_docs/memory/architecture.md",
      "cli/src/index.ts",
    ];

    for (const candidate of CANDIDATES) {
      const journalled =
        journalFileWrites.taskFolderRelativePath("/repo", `/repo/${candidate}`) !== null;

      expect(taskIdentityFromWrittenPath(candidate) !== null, candidate).toBe(journalled);
    }
  });
});

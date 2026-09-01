import { describe, expect, it } from "vitest";
import type { ConflictDecision } from "../../src/kernel/merge.js";

describe("ConflictDecision", () => {
  it("exists as a type and accepts overwrite", () => {
    const decision: ConflictDecision = "overwrite";
    expect(decision).toBe("overwrite");
  });

  it("accepts skip", () => {
    const decision: ConflictDecision = "skip";
    expect(decision).toBe("skip");
  });

  it("accepts backup", () => {
    const decision: ConflictDecision = "backup";
    expect(decision).toBe("backup");
  });

  it("narrowing: switch on ConflictDecision", () => {
    const decisions: ConflictDecision[] = ["overwrite", "skip", "backup"];
    const results: string[] = [];

    for (const decision of decisions) {
      switch (decision) {
        case "overwrite":
          results.push("overwrote");
          break;
        case "skip":
          results.push("skipped");
          break;
        case "backup":
          results.push("backed up");
          break;
      }
    }

    expect(results).toEqual(["overwrote", "skipped", "backed up"]);
  });
});

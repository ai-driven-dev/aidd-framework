import { describe, expect, it } from "vitest";
import { resolveTaskDocumentNameFallback } from "../../src/domain/models/task-name-fallback.js";

describe("resolveTaskDocumentNameFallback", () => {
  it("falls back to the containing folder's name for plan.md", () => {
    const filePath = "/project/aidd_docs/tasks/2026_07/2026_07_19_list-status-columns/plan.md";

    expect(resolveTaskDocumentNameFallback(filePath)).toBe("2026_07_19_list-status-columns");
  });

  it("falls back to the containing folder's name for master-plan.md", () => {
    const filePath =
      "/project/aidd_docs/tasks/2026_07/2026_07_19_list-status-columns/master-plan.md";

    expect(resolveTaskDocumentNameFallback(filePath)).toBe("2026_07_19_list-status-columns");
  });

  it("falls back to the containing folder's name for spec.md", () => {
    const filePath = "/project/aidd_docs/tasks/2026_07/2026_07_19_list-status-columns/spec.md";

    expect(resolveTaskDocumentNameFallback(filePath)).toBe("2026_07_19_list-status-columns");
  });

  it("falls back to its own filename for phase-1.md, unaffected by the folder rule", () => {
    const filePath = "/project/aidd_docs/tasks/2026_07/2026_07_19_list-status-columns/phase-1.md";

    expect(resolveTaskDocumentNameFallback(filePath)).toBe("phase-1");
  });

  it("falls back to its own filename for a loose, non-parent-eligible document", () => {
    const filePath = "/project/aidd_docs/tasks/2026_07/2026_07_07-infra-fid559-reconciliation.md";

    expect(resolveTaskDocumentNameFallback(filePath)).toBe(
      "2026_07_07-infra-fid559-reconciliation"
    );
  });
});

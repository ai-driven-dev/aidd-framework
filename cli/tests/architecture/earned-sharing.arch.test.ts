/**
 * A module is shared only when it has callers in at least two functional areas. One caller
 * means the code belongs to that caller: move it down, do not promote it.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, importersByFile, sourceFiles } from "./helpers.js";

/** Files that fail the rule today. This list may only shrink. */
const BASELINE: string[] = [];

/** The functional area a file belongs to. Two callers in one area are still one area. */
function areaOf(file: string): string {
  // The composition root constructs every use case by definition: counting it as an area
  // would let any module satisfy the rule by being wired rather than needed twice.
  if (file.startsWith("src/runtime/wiring/")) return "composition-root";
  // A context's application layer is where the areas live.
  const contextArea = /^src\/contexts\/[^/]+\/application\/([^/]+)\//.exec(file);
  if (contextArea) return `use-case:${contextArea[1]}`;
  const contextRoot = /^src\/contexts\/([^/]+)\/application\/[^/]+\.ts$/.exec(file);
  if (contextRoot) return `use-case:${contextRoot[1]}-root`;
  const contextInner = /^src\/contexts\/([^/]+)\/(domain|infrastructure)\//.exec(file);
  if (contextInner) return `${contextInner[2]}:${contextInner[1]}`;
  if (file.startsWith("src/presentation/commands/")) return "commands";
  if (file.startsWith("src/presentation/prompts/")) return "prompts";
  if (file.startsWith("src/presentation/")) return "presentation";
  if (file.startsWith("src/kernel/")) return "kernel";
  if (file.startsWith("src/runtime/")) return "runtime";
  return "other";
}

const NON_AREAS = new Set(["use-case:shared", "composition-root"]);

/**
 * Only a file sitting directly inside a `shared/` directory is offered to callers; one nested
 * further under a shared module is that module's own private step.
 */
function underSharedDirectory(file: string): boolean {
  return /\/shared\/[^/]+$/.test(file);
}

/** Over an explicit file list and importer map, so the rule is testable off the real tree. */
function unearned(files: readonly string[], importers: Map<string, Set<string>>): string[] {
  return files.filter(underSharedDirectory).filter((file) => {
    const areas = new Set(
      [...(importers.get(file) ?? [])].map(areaOf).filter((area) => !NON_AREAS.has(area))
    );
    return areas.size < 2;
  });
}

describe("shared modules are earned", () => {
  it("every shared module has callers in at least two areas", () => {
    const files = sourceFiles();
    // A rule that selects nothing passes forever, and this one selects a single directory.
    expect(
      files.filter(underSharedDirectory).length,
      "no shared module found — the scope of this rule is stale"
    ).toBeGreaterThan(0);
    const violations = unearned(files, importersByFile());

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "new shared module with fewer than two calling areas").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("flags a shared module called from one area and clears one called from two", () => {
    const lonely = "src/contexts/framework/application/shared/lonely.ts";
    const earned = "src/contexts/framework/application/shared/earned.ts";
    const importers = new Map([
      [lonely, new Set(["src/contexts/framework/application/doctor/a.ts"])],
      [
        earned,
        new Set([
          "src/contexts/framework/application/doctor/a.ts",
          "src/presentation/commands/doctor.ts",
        ]),
      ],
    ]);

    expect(unearned([lonely, earned], importers)).toEqual([lonely]);
  });

  it("names an area for every place a caller lives, so two callers are not both 'other'", () => {
    expect(areaOf("src/contexts/framework/application/doctor/a.ts")).toBe("use-case:doctor");
    expect(areaOf("src/contexts/framework/application/setup-use-case.ts")).toBe(
      "use-case:framework-root"
    );
    expect(areaOf("src/contexts/tools/domain/registry.ts")).toBe("domain:tools");
    expect(areaOf("src/contexts/tools/infrastructure/a.ts")).toBe("infrastructure:tools");
    expect(areaOf("src/presentation/commands/doctor.ts")).toBe("commands");
    expect(areaOf("src/presentation/display/a.ts")).toBe("presentation");
    expect(areaOf("src/kernel/tool.ts")).toBe("kernel");
    expect(areaOf("src/runtime/wiring/tools.ts"), "wired, not needed twice").toBe(
      "composition-root"
    );
  });
});

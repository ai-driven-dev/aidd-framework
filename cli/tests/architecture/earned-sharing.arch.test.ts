/**
 * A module is shared only when it has callers in at least two functional areas.
 * One caller means the code belongs to that caller — move it down, do not promote it.
 *
 * See `.claude/rules/00-architecture/0-shared-modules.md`.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, importersByFile, sourceFiles } from "./helpers.js";

/** Files that fail the rule today. This list may only shrink. */
const BASELINE: string[] = [];

/** The functional area a file belongs to. Two callers in one area are still one area. */
function areaOf(file: string): string {
  // The composition root constructs every use case by definition — counting it as an
  // area would let any module satisfy the rule by being wired rather than by being
  // needed in two places. Drop it the same way `use-case:shared` is dropped below.
  if (file === "src/infrastructure/deps.ts") return "composition-root";
  const useCase = /^src\/application\/use-cases\/([^/]+)\//.exec(file);
  if (useCase) return `use-case:${useCase[1]}`;
  if (file.startsWith("src/application/use-cases/")) return "use-case:root";
  if (file.startsWith("src/application/commands/")) return "commands";
  if (file.startsWith("src/domain/")) return "domain";
  if (file.startsWith("src/infrastructure/")) return "infrastructure";
  return "other";
}

const NON_AREAS = new Set(["use-case:shared", "composition-root"]);

/**
 * A file is "offered as shared" only if it sits directly inside a `shared/` directory.
 * A file nested further under one shared module (e.g. `shared/resolve-marketplace/x.ts`)
 * is a private step of that module, not something offered to callers — its only caller
 * is the module it belongs to, so it must not be judged by this rule.
 */
function underSharedDirectory(file: string): boolean {
  return /\/shared\/[^/]+$/.test(file);
}

describe("shared modules are earned", () => {
  it("every shared module has callers in at least two areas", () => {
    const importers = importersByFile();
    const violations = sourceFiles()
      .filter(underSharedDirectory)
      .filter((file) => {
        const areas = new Set(
          [...(importers.get(file) ?? [])].map(areaOf).filter((area) => !NON_AREAS.has(area))
        );
        return areas.size < 2;
      });

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "new shared module with fewer than two calling areas").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });
});

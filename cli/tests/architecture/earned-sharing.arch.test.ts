/**
 * A module is shared only when it has callers in at least two functional areas.
 * One caller means the code belongs to that caller — move it down, do not promote it.
 *
 * See `.claude/rules/00-architecture/0-shared-modules.md`.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, importersByFile, sourceFiles } from "./helpers.js";

/** Files that fail the rule today. This list may only shrink. */
const BASELINE = [
  "src/application/commands/shared/spawn-cli-command.ts",
  "src/application/use-cases/shared/fetch-marketplace-source-use-case.ts",
  "src/application/use-cases/shared/generate-tool-distribution-use-case.ts",
  "src/application/use-cases/shared/resolve-restore-decision.ts",
  "src/application/use-cases/shared/restore-drift-entries-use-case.ts",
  "src/application/use-cases/shared/restore-merge-files-use-case.ts",
  "src/application/use-cases/shared/restore-regular-files-use-case.ts",
];

/** The functional area a file belongs to. Two callers in one area are still one area. */
function areaOf(file: string): string {
  const useCase = /^src\/application\/use-cases\/([^/]+)\//.exec(file);
  if (useCase) return `use-case:${useCase[1]}`;
  if (file.startsWith("src/application/use-cases/")) return "use-case:root";
  if (file.startsWith("src/application/commands/")) return "commands";
  if (file.startsWith("src/domain/")) return "domain";
  if (file.startsWith("src/infrastructure/")) return "infrastructure";
  return "other";
}

function underSharedDirectory(file: string): boolean {
  return file.includes("/shared/");
}

describe("shared modules are earned", () => {
  it("every shared module has callers in at least two areas", () => {
    const importers = importersByFile();
    const violations = sourceFiles()
      .filter(underSharedDirectory)
      .filter((file) => {
        const areas = new Set(
          [...(importers.get(file) ?? [])].map(areaOf).filter((area) => area !== "use-case:shared")
        );
        return areas.size < 2;
      });

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "new shared module with fewer than two calling areas").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });
});

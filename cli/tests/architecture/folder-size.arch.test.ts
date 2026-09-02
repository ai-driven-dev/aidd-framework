/**
 * A directory carries at most ten direct `.ts` source files.
 *
 * Past that size a folder stops being a place and becomes a pile: nobody can hold its
 * contents in mind at once, so files stop finding their neighbours and duplication
 * creeps in unnoticed. This is the measure of the splitting this refactor is doing,
 * not an opinion about it. Rule and limit are taken from the `gouvernail` project's
 * harness.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, sourceFiles } from "./helpers.js";

const MAX_FILES_PER_FOLDER = 10;

/**
 * Directories that exceed the limit today, with the count each was measured at.
 * This list may only shrink.
 */
const BASELINE = [
  "src/application/commands", // 17
  "src/domain/models", // 13
  "src/domain/ports", // 11
  "src/infrastructure/adapters", // 14
];

/** Direct `.ts` files per parent directory — a subfolder counts toward itself, not its parent. */
function countsByDirectory(files: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const dir = file.slice(0, file.lastIndexOf("/"));
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return counts;
}

function foldersOverLimit(files: readonly string[], limit: number): string[] {
  return [...countsByDirectory(files)]
    .filter(([, count]) => count > limit)
    .map(([dir]) => dir)
    .sort();
}

describe("folders stay small enough to hold in mind", () => {
  it("no directory carries more than ten direct source files", () => {
    const violations = foldersOverLimit(sourceFiles(), MAX_FILES_PER_FOLDER);

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "new folder past the size limit — split it").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("flags a folder past the limit and leaves one sitting at the limit alone", () => {
    const files = [
      ...Array.from({ length: 11 }, (_, i) => `src/pile/f${i}.ts`),
      ...Array.from({ length: 10 }, (_, i) => `src/tidy/f${i}.ts`),
    ];

    expect(foldersOverLimit(files, MAX_FILES_PER_FOLDER)).toEqual(["src/pile"]);
  });
});

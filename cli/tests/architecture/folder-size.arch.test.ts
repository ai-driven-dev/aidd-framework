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
 * Directories over the limit, each with the count it carries and the reason it is still
 * here. This list may only shrink, and an entry leaves when the defect behind it is fixed —
 * not when files are shuffled to satisfy a count.
 *
 * The count is not decoration: the test asserts it, so a reason written around a number
 * nobody measured fails here instead of surviving into four documents. That is what
 * happened to the previous version of this file, which claimed thirteen command files plus
 * two helpers and called the total fourteen.
 *
 * Three entries have left that way. `src/contexts/tools/domain` held three capability
 * classes beside the folder holding the other five; they rejoined their siblings and it
 * dropped to nine. `src/contexts/framework/application/install` held a use case whose only
 * importers inside the context live in `uninstall/`, plus four thirty-line descriptors around
 * one engine; both groupings were made explicit and it dropped to six. `src/kernel` held
 * `flat-paths.ts` and `relative-link-rewrite.ts`, read by six files and seven across tools and
 * translate — eight distinct files, five reading both — to decide where content lands and how
 * its links follow; `materialization/` names that and it dropped to nine.
 *
 * The one below will not leave, and saying so is worth more than promising a later phase
 * nobody owes.
 */
const BASELINE: readonly { readonly path: string; readonly count: number }[] = [
  // Eleven files carry the command surface — ten register a command on the program, `menu.ts`
  // runs the interactive loop — plus `global-options.ts` and `spawn-cli-command.ts`, whose
  // importers all live in this folder. That is the flattest mapping there is from the CLI's
  // surface to its source. Moving the two helpers out would leave eleven: still over the
  // limit, and clearer about nothing.
  { path: "src/presentation/commands", count: 13 },
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

    const { added, fixed } = expectRatchet(
      violations,
      BASELINE.map((entry) => entry.path)
    );
    expect(added, "new folder past the size limit — split it").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("holds each baseline entry to the count its reason was written around", () => {
    const measured = countsByDirectory(sourceFiles());
    const recorded = BASELINE.map(({ path, count }) => `${path}: ${count}`);
    const actual = BASELINE.map(({ path }) => `${path}: ${measured.get(path) ?? 0}`);

    expect(
      actual,
      "a baseline count drifted from the tree — fix the number and its reason"
    ).toEqual(recorded);
  });

  it("fails the ratchet by name when a folder is pushed past the limit", () => {
    const files = [
      ...Array.from({ length: 11 }, (_, i) => `src/pile/f${i}.ts`),
      ...Array.from({ length: 10 }, (_, i) => `src/tidy/f${i}.ts`),
    ];

    const violations = foldersOverLimit(files, MAX_FILES_PER_FOLDER);
    expect(violations, "eleven files is over, ten is not").toEqual(["src/pile"]);

    const { added } = expectRatchet(violations, []);
    expect(added, "the ratchet names the offender, not just the detector").toEqual(["src/pile"]);
  });
});

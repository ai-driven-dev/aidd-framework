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
  // Twelve files carry the command surface — eleven register a command on the program,
  // `menu.ts` runs the interactive loop — plus three helpers whose importers all live in
  // this folder: `global-options.ts`, `spawn-cli-command.ts`, and
  // `cli/src/presentation/commands/sync-native-activation.ts`, which `plugin.ts` and
  // `marketplace.ts` both drive after their own use case to read and surface what it
  // returns, the same shape `sync.ts` already held on its own before either needed it.
  // That is the flattest mapping there is from the CLI's surface to its source. Moving
  // the three helpers out would leave twelve: still over the limit, and clearer about
  // nothing. `telemetry.ts` is the eleventh command.
  { path: "src/presentation/commands", count: 15 },
  // Eleven, and staying there. The kernel gained `measurement.ts` — what a tool declares
  // about being measured, declared by tools and read by telemetry — and the five file
  // helpers that came with it are already grouped under `reading/`. What is left is eleven
  // separate vocabularies with no pair among them: errors (126 importers), tool (111), file
  // (52), source (33), paths (27), merge (22), markdown (17), measurement (10), scope (9),
  // semver (6), describe-error (6). Reaching ten means moving one of those, and the cheapest
  // is `describe-error` at six — into a folder holding it and nothing else. A grouping
  // invented to satisfy a count is worse than the count.
  { path: "src/kernel", count: 11 },
  // Telemetry's own vocabulary: what a record is, how a report is shaped, and the five
  // attribution rules that decide whose a figure is. They are one subject, and splitting
  // them by shape would file `cost-report.ts` away from the envelope it fills.
  // Twenty since `skill-name.ts`: the one place that says when two spellings name the same
  // skill, read by step and flow attribution alike.
  { path: "src/contexts/telemetry/domain", count: 20 },
  // Twelve ports because measurement reads twelve different things it does not own — a
  // sink, a journal, an identity, a backlog, per-tool cost, a host registry, hook trust,
  // this project's installed plugins, its ignore file, its version control. One port per
  // question asked; collapsing any two would be a port that answers two.
  { path: "src/contexts/telemetry/domain/ports", count: 11 },
  // Eleven since `cli/src/contexts/tools/domain/marketplace-source-conflict.ts`: whether
  // a marketplace name a host's own registry already holds is pointed at a different,
  // resolved source — pure, and read by both the sync-time guard and `doctor`'s own
  // conflict check, the same relationship `host-plugin-registration.ts` already has to
  // `doctor` and `telemetry`. No existing grouping here fits it: `marketplace-catalog.ts`,
  // `marketplace-entry.ts` and `marketplace-settings.ts` are each a tool-build concern this
  // file is not, and moving one of them out to make room would be exactly the shuffle this
  // rule refuses.
  { path: "src/contexts/tools/domain", count: 11 },

  // `cli/src/contexts/framework/domain/marketplace-source-drift.ts` joined: deciding a version/migration drift is a
  // fact about aidd's own migration, which belongs in `framework`, not `tools`
  // (bloquant 12, `architecture.md`'s "concern decides placement" rule).
  { path: "src/contexts/framework/domain", count: 11 },
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

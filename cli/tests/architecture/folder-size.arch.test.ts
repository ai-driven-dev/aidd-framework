/**
 * Past ten direct `.ts` files a folder stops being a place and becomes a pile: files stop
 * finding their neighbours and duplication creeps in unnoticed.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, sourceFiles } from "./helpers.js";

const MAX_FILES_PER_FOLDER = 10;

/**
 * Directories over the limit, each with the count it carries and the reason it is still here.
 * The list may only shrink, and an entry leaves when the defect behind it is fixed, not when
 * files are shuffled. The test asserts the count, so a reason nobody measured fails here.
 */
const BASELINE: readonly { readonly path: string; readonly count: number }[] = [
  // Twelve files carry the command surface, plus three helpers no other folder imports. That
  // is the flattest mapping from the CLI's surface to its source; moving the helpers out
  // would leave twelve, still over the limit and clearer about nothing.
  { path: "src/presentation/commands", count: 15 },
  // Eleven separate vocabularies with no pair among them, the file helpers already grouped
  // under `reading/`. Reaching ten means a folder holding one file: a grouping invented to
  // satisfy a count is worse than the count.
  { path: "src/kernel", count: 11 },
  // Telemetry's own vocabulary — what a record is, how a report is shaped, whose a figure is
  // — is one subject: splitting it by shape files `cost-report.ts` away from the envelope it
  // fills.
  { path: "src/contexts/telemetry/domain", count: 20 },
  // Measurement reads that many things it does not own: a sink, a journal, an identity, a
  // host registry, hook trust and the rest. One port per question; collapsing two answers two.
  { path: "src/contexts/telemetry/domain/ports", count: 11 },
  // `marketplace-source-conflict.ts` is read by both the sync-time guard and `doctor`, and no
  // grouping here fits it: the marketplace files beside it are each a tool-build concern it is
  // not, and moving one out to make room is the shuffle this rule refuses.
  { path: "src/contexts/tools/domain", count: 11 },

  // `marketplace-source-drift.ts` decides a version/migration drift, a fact about aidd's own
  // migration: that concern belongs to `framework`, not `tools`.
  { path: "src/contexts/framework/domain", count: 11 },

  // Four native-cache and host-CLI helpers are shared by `clean` at project and machine scope
  // both, which is what `earned-sharing.arch.test.ts` means by earned; a `clean/`-only home
  // would pass that rule by sitting outside the directory it judges. Nothing else here groups
  // with them.
  { path: "src/contexts/framework/application/shared", count: 13 },
];

/** A subfolder counts toward itself, not toward its parent. */
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

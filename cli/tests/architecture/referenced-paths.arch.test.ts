/**
 * A path named in the skills must still exist.
 *
 * The skills are read by an agent about to change this codebase, so a path that has
 * moved does not merely go stale — it sends the next change to a directory that is no
 * longer there. This refactor moves hundreds of files, which is exactly when that rots.
 *
 * Only prose is checked. A fenced block is where these documents show invented examples
 * (`widget-mode.ts`, `finalize-write-use-case.ts`), and demanding those exist would be
 * demanding the illustration be real. Prose, by contrast, is instruction: when it names
 * a path, it means that one.
 *
 * The idea is taken from the `gouvernail` project's `check-referenced-paths`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_ROOT, expectRatchet } from "./helpers.js";

const FENCED_BLOCK = /```[\s\S]*?```/g;

/**
 * A citation is either rooted at the package (`src/…`, `tests/…`) or written the way the
 * skills mostly write it — relative to `src/`, naming the top-level area directly
 * (`kernel/…`, `contexts/…`). Both spellings are instructions to open the same file.
 *
 * The second form was invisible here until a moved file proved it: `kernel/flat-paths.ts`
 * went to `kernel/materialization/` and this test stayed green over a dead reference,
 * because the regex demanded a prefix the document did not write.
 *
 * It cannot see the pre-refactor spellings — `application/`, `infrastructure/`, and a bare
 * `domain/…`. Three dead citations survived in `auth.md` and one in `testing.md` for exactly
 * that reason. Widening the prefix list alone is not the fix, and was tried: `application/json`
 * and `application/vnd.github` are media types, and `domain/ports` is how a document names a
 * fragment relative to a context, so a wider regex reports more noise than drift. Closing it
 * needs a resolver that knows both shapes, which is a change of its own.
 */
const CITED_PATH =
  /\b(?:src|tests)\/[A-Za-z0-9_./-]+|\b(?:kernel|contexts|presentation|runtime)\/[A-Za-z0-9_./-]+/g;

/** `src/`-relative citations resolve under `src/`; rooted ones resolve as written. */
function resolveCitation(cited: string): string {
  return cited.startsWith("src/") || cited.startsWith("tests/") ? cited : `src/${cited}`;
}

/** Paths cited in prose that no longer exist. This list may only shrink. */
const BASELINE: string[] = [];

/**
 * Where a cited path is an instruction rather than a record.
 *
 * The skills were the whole scope for one phase, and that was too narrow: `memory/` is
 * loaded into every agent conversation and cited four paths that had moved, `ARCHITECTURE.md`
 * still described a `runtime/wiring/framework.ts` split into `runtime/wiring/` phases ago, and
 * `vitest.config.ts` excluded three directories from coverage that do not exist — so the
 * exclusions did nothing and the numbers they were written to protect were wrong.
 *
 * `aidd_docs/tasks/` is deliberately absent: those are archives. A finished plan describing
 * the tree as it was is a record, and demanding it stay true would forbid ever moving a file.
 */
const INSTRUCTING_SOURCES: readonly string[] = [
  ".claude/skills",
  "aidd_docs/memory",
  "aidd_docs/GUIDELINES.md",
  "ARCHITECTURE.md",
  "README.md",
  "vitest.config.ts",
  "vitest.workspace.ts",
  "knip.json",
  "tsup.config.ts",
  "stryker.conf.json",
];

function instructingFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  };
  for (const source of INSTRUCTING_SOURCES) {
    const full = join(CLI_ROOT, source);
    if (statSync(full).isDirectory()) walk(full);
    else out.push(full);
  }
  return out;
}

function statable(relativePath: string): boolean {
  try {
    statSync(join(CLI_ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a cited path names something on disk.
 *
 * A `.js` specifier is how TypeScript's ESM output names a `.ts` file, so a document citing
 * `tests/helpers/vitest-text-loader.js` is naming a file that exists — the same mapping
 * `import-rules-bite.arch.test.ts` makes for the same reason.
 */
function exists(relativePath: string): boolean {
  if (statable(relativePath)) return true;
  return relativePath.endsWith(".js") && statable(relativePath.replace(/\.js$/, ".ts"));
}

/** Every path a document instructs the reader to open, fenced examples excluded. */
function citedInProse(text: string): string[] {
  const prose = text.replace(FENCED_BLOCK, "");
  return (
    [...new Set(prose.match(CITED_PATH) ?? [])]
      // Trailing punctuation belongs to the sentence, not the path: `src/kernel/.` and
      // `src/kernel/` both name the directory. Stripping them naively turned a cited `src/`
      // into `src`, which then resolved as `src/src` and read as dead.
      .map((cited) => cited.replace(/[./]+$/, ""))
      .filter((cited) => cited.includes("/"))
  );
}

describe("every document that instructs names paths that exist", () => {
  it("every path an instructing document names is still there", () => {
    const dead = new Set<string>();
    for (const file of instructingFiles()) {
      for (const cited of citedInProse(readFileSync(file, "utf8"))) {
        if (!exists(resolveCitation(cited))) dead.add(cited);
      }
    }

    const { added, fixed } = expectRatchet([...dead].sort(), BASELINE);
    expect(added, "an instructing document names a path that no longer exists").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("reads instructions and ignores illustrations", () => {
    const text = "Open `src/cli.ts`.\n\n```ts\n// src/domain/models/invented.ts\n```\n";
    expect(citedInProse(text)).toEqual(["src/cli.ts"]);
  });

  it("catches a dead path written the way the skills write it, without the src/ prefix", () => {
    const cited = citedInProse("The primitives live in `kernel/gone.ts`.");

    expect(cited, "a bare top-level area is a citation too").toEqual(["kernel/gone.ts"]);
    expect(resolveCitation("kernel/gone.ts")).toBe("src/kernel/gone.ts");
    expect(exists(resolveCitation("kernel/gone.ts")), "and it is checked, not skipped").toBe(false);
    expect(exists(resolveCitation("kernel/errors.ts")), "a live one still passes").toBe(true);
  });
});

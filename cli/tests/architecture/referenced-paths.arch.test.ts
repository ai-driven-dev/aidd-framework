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
 */
const CITED_PATH =
  /\b(?:src|tests)\/[A-Za-z0-9_./-]+|\b(?:kernel|contexts|presentation|runtime)\/[A-Za-z0-9_./-]+/g;

/** `src/`-relative citations resolve under `src/`; rooted ones resolve as written. */
function resolveCitation(cited: string): string {
  return cited.startsWith("src/") || cited.startsWith("tests/") ? cited : `src/${cited}`;
}

/** Paths cited in prose that no longer exist. This list may only shrink. */
const BASELINE: string[] = [];

function skillFiles(): string[] {
  const root = join(CLI_ROOT, ".claude", "skills");
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(root);
  return out;
}

function exists(relativePath: string): boolean {
  try {
    statSync(join(CLI_ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

/** Every path a document instructs the reader to open, fenced examples excluded. */
function citedInProse(text: string): string[] {
  const prose = text.replace(FENCED_BLOCK, "");
  return [...new Set(prose.match(CITED_PATH) ?? [])].map((cited) => cited.replace(/[/.]+$/, ""));
}

describe("the skills name paths that exist", () => {
  it("every path the skills instruct a reader to open is still there", () => {
    const dead = new Set<string>();
    for (const file of skillFiles()) {
      for (const cited of citedInProse(readFileSync(file, "utf8"))) {
        if (!exists(resolveCitation(cited))) dead.add(cited);
      }
    }

    const { added, fixed } = expectRatchet([...dead].sort(), BASELINE);
    expect(added, "a skill names a path that no longer exists").toEqual([]);
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

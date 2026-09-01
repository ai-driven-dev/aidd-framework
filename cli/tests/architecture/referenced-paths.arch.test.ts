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
const CITED_PATH = /\b(?:src|tests)\/[A-Za-z0-9_./-]+/g;

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
        if (!exists(cited)) dead.add(cited);
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
});

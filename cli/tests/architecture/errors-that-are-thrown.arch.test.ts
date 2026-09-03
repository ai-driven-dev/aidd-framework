/**
 * Every error the catalog declares is thrown somewhere.
 *
 * `kernel/errors.ts` is one catalog for the whole codebase, which is what makes it easy to
 * read and easy to rot: a class outlives the code that threw it, and nothing complains. Five
 * did. Three had never been thrown in this repository's history; two were orphaned by a
 * deliberate feature removal and stayed behind, one of them still telling users to
 * "Use 'ai' or 'ide'" — commands that no longer exist.
 *
 * `knip --production` cannot see this: it reports an export unused only when no file imports
 * it, and these were imported by their own tests. A test asserting `new SomeError().name` is
 * not a caller; it is the catalog testing itself.
 *
 * The baseline is empty and must stay that way. An error with no thrower is either a missing
 * code path or a leftover, and both are worth stopping for.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, read, sourceFiles } from "./helpers.js";

const CATALOG = "src/kernel/errors.ts";

function declaredErrors(): string[] {
  return [...read(CATALOG).matchAll(/^export class (\w+) extends/gm)].map(
    (match) => match[1] as string
  );
}

/** Class names appearing after `throw new`, anywhere but the catalog itself. */
function thrownErrors(files: readonly string[]): Set<string> {
  const thrown = new Set<string>();
  for (const file of files) {
    for (const match of read(file).matchAll(/throw new (\w+)/g)) {
      thrown.add(match[1] as string);
    }
  }
  return thrown;
}

/** Errors declared in the catalog that no production file throws. */
const BASELINE: string[] = [];

describe("the error catalog carries no class nothing throws", () => {
  it("every declared error is thrown by some production file", () => {
    const thrown = thrownErrors(sourceFiles());
    const orphans = declaredErrors()
      .filter((name) => !thrown.has(name))
      .sort();

    const { added, fixed } = expectRatchet(orphans, BASELINE);
    expect(
      added,
      "declared but never thrown — either a code path is missing, or the class outlived it"
    ).toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("reads a class as thrown only where the throw is, not where the name is mentioned", () => {
    const mentions = 'expect(error.name).toBe("GhostError");';
    const throws = "throw new GhostError();";

    expect(thrownErrors([]).size, "no files, no throws").toBe(0);
    expect(/throw new (\w+)/.exec(mentions), "a name in an assertion is not a throw").toBeNull();
    expect(/throw new (\w+)/.exec(throws)?.[1]).toBe("GhostError");
  });
});

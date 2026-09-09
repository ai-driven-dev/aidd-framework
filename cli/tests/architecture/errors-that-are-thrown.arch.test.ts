/**
 * One catalog for the whole codebase is easy to read and easy to rot: a class outlives the
 * code that threw it and nothing complains. knip cannot see it — an error imported by its own
 * test reads as used, and a test asserting `new SomeError().name` is not a caller.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, read, sourceFiles } from "./helpers.js";

const CATALOG = "src/kernel/errors.ts";

function declaredErrors(): string[] {
  return [...read(CATALOG).matchAll(/^export class (\w+) extends/gm)].map(
    (match) => match[1] as string
  );
}

function thrownErrors(files: readonly string[]): Set<string> {
  const thrown = new Set<string>();
  for (const file of files) {
    for (const match of read(file).matchAll(/throw new (\w+)/g)) {
      thrown.add(match[1] as string);
    }
  }
  return thrown;
}

/** Empty and staying so: an error with no thrower is a missing code path or a leftover. */
const BASELINE: string[] = [];

describe("the error catalog carries no class nothing throws", () => {
  it("every declared error is thrown by some production file", () => {
    // The catalog is excluded: a throw inside it would let a class outlive every real
    // thrower as long as it mentions itself once.
    const thrown = thrownErrors(sourceFiles().filter((file) => file !== CATALOG));
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

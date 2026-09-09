/**
 * One catalog for the whole codebase is easy to read and easy to rot: a class outlives the
 * code that threw it and nothing complains. knip cannot see it — an error imported by its own
 * test reads as used, and a test asserting `new SomeError().name` is not a caller.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, read, sourceFiles } from "./helpers.js";

const CATALOG = "src/kernel/errors.ts";

function declaredErrorNames(source: string): string[] {
  return [...source.matchAll(/^export class (\w+) extends/gm)].map((match) => match[1] as string);
}

function thrownNames(source: string): string[] {
  return [...source.matchAll(/throw new (\w+)/g)].map((match) => match[1] as string);
}

function thrownErrors(files: readonly string[]): Set<string> {
  const thrown = new Set<string>();
  for (const file of files) {
    for (const name of thrownNames(read(file))) thrown.add(name);
  }
  return thrown;
}

function orphanErrors(declared: readonly string[], thrown: ReadonlySet<string>): string[] {
  return declared.filter((name) => !thrown.has(name)).sort();
}

/** Empty and staying so: an error with no thrower is a missing code path or a leftover. */
const BASELINE: string[] = [];

describe("the error catalog carries no class nothing throws", () => {
  it("every declared error is thrown by some production file", () => {
    // The catalog is excluded: a throw inside it would let a class outlive every real
    // thrower as long as it mentions itself once.
    const thrown = thrownErrors(sourceFiles().filter((file) => file !== CATALOG));
    const orphans = orphanErrors(declaredErrorNames(read(CATALOG)), thrown);

    const { added, fixed } = expectRatchet(orphans, BASELINE);
    expect(
      added,
      "declared but never thrown — either a code path is missing, or the class outlived it"
    ).toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });
});

describe("the guard itself", () => {
  it("reads a class as thrown only where the throw is, not where the name is mentioned", () => {
    expect(thrownNames('expect(error.name).toBe("GhostError");')).toEqual([]);
    expect(thrownNames("throw new GhostError();")).toEqual(["GhostError"]);
    expect(declaredErrorNames("export class GhostError extends Error {}")).toEqual(["GhostError"]);
    expect(declaredErrorNames("const GhostError = 1;"), "only a declaration counts").toEqual([]);
  });

  it("names a declared error nothing throws, and clears one something does", () => {
    const catalog = [
      "export class GhostError extends AiddError {}",
      "export class LiveError extends AiddError {}",
    ].join("\n");
    const declared = declaredErrorNames(catalog);

    expect(orphanErrors(declared, new Set(["LiveError"]))).toEqual(["GhostError"]);
    expect(orphanErrors(declared, new Set(["GhostError", "LiveError"]))).toEqual([]);
  });
});

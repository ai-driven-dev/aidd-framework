/**
 * A file escaping mutation is silent: the score does not drop, because the mutants that would
 * have died were never generated. `mutation-scopes.json` declares the globs and what is left
 * out, so a directory belonging to neither fails by name rather than as a flat number.
 */
import { describe, expect, it } from "vitest";
import { matchesGlob, read, sourceFiles } from "./helpers.js";

interface ScopeDeclaration {
  readonly scopes: Readonly<Record<string, string>>;
  readonly excluded: Readonly<Record<string, string>>;
}

function declaration(): ScopeDeclaration {
  return JSON.parse(read("mutation-scopes.json")) as ScopeDeclaration;
}

function isCovered(path: string, { scopes, excluded }: ScopeDeclaration): boolean {
  const globs = [...Object.values(scopes), ...Object.keys(excluded)];
  return globs.some((glob) => matchesGlob(glob, path));
}

describe("mutation covers every source file", () => {
  it("no file under src/ falls outside both the scopes and the exclusions", () => {
    const declared = declaration();
    const uncovered = sourceFiles().filter((file) => !isCovered(file, declared));

    expect(
      uncovered,
      "neither mutated nor excluded — add it to a scope in mutation-scopes.json, or exclude it with the reason"
    ).toEqual([]);
  });

  it("every exclusion carries a reason, and every scope matches something", () => {
    const { scopes, excluded } = declaration();
    const files = sourceFiles();

    for (const [glob, reason] of Object.entries(excluded)) {
      expect(reason.length, `${glob} is excluded with no reason given`).toBeGreaterThan(40);
      expect(
        files.some((file) => matchesGlob(glob, file)),
        `${glob} excludes nothing — the directory it names is gone`
      ).toBe(true);
    }
    for (const [name, glob] of Object.entries(scopes)) {
      expect(
        files.some((file) => matchesGlob(glob, file)),
        `scope "${name}" (${glob}) matches no file — it would score an empty set`
      ).toBe(true);
    }
  });

  it("package.json runs every scope, and nothing it does not", () => {
    // A scope name copied into a script is a second list: a scope with no way to run it, and
    // a script for a scope that is gone, both fail here.
    const { scripts } = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const scripted = Object.keys(scripts)
      .filter((name) => name.startsWith("test:mutation:"))
      .map((name) => name.slice("test:mutation:".length));

    expect(scripted.sort()).toEqual(Object.keys(declaration().scopes).sort());
  });

  it("no other file lists what mutation covers", () => {
    // Read through `read()`, resolved against the cli package root: a bare relative
    // `readFileSync` only finds the file when the cwd happens to be `cli/`.
    const stryker = JSON.parse(read("stryker.conf.json")) as Record<string, unknown>;
    expect("mutate" in stryker, "stryker.conf.json declares its own mutate again").toBe(false);
  });

  it("matches a path inside a glob and rejects one outside it", () => {
    expect(matchesGlob("src/kernel/**/*.ts", "src/kernel/ports/logger.ts")).toBe(true);
    expect(matchesGlob("src/kernel/**/*.ts", "src/kernel/tool.ts")).toBe(true);
    expect(matchesGlob("src/kernel/**/*.ts", "src/contexts/tools/domain/registry.ts")).toBe(false);
    expect(matchesGlob("src/cli.ts", "src/cli.ts")).toBe(true);
    expect(matchesGlob("src/cli.ts", "src/clints.ts")).toBe(false);
  });
});

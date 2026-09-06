/**
 * Every source file is either mutated or excluded on purpose.
 *
 * `stryker.conf.json` used to name seventeen kernel files one by one. A file added to the
 * kernel escaped mutation in silence: the score did not drop, because the mutants that
 * would have died were never generated. The same shape — a scope that quietly stops
 * covering anything — has already produced two false greens in this repo.
 *
 * `mutation-scopes.json` now declares the globs and, beside them, what is left out and
 * why. This reads both halves, so a new directory belonging to neither is a failure that
 * names it rather than a number that stays flat.
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
    // The globs are declared once; the scope names were not, and a name copied into a
    // script is a second list. Adding a scope with no way to run it, or leaving a script
    // behind for a scope that is gone, both fail here.
    const { scripts } = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const scripted = Object.keys(scripts)
      .filter((name) => name.startsWith("test:mutation:"))
      .map((name) => name.slice("test:mutation:".length));

    expect(scripted.sort()).toEqual(Object.keys(declaration().scopes).sort());
  });

  it("no other file lists what mutation covers", () => {
    // The declaration is the single source; stryker.conf.json carrying its own `mutate`
    // is exactly the drift this replaces. Read through `read()`, resolved against the cli
    // package root: a bare relative `readFileSync("stryker.conf.json")` only found the file
    // because every other gate in this suite happens to run with `cli/` as the cwd — a
    // repository-root invocation threw ENOENT on this line alone.
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

/**
 * A file escaping mutation is silent: the score does not drop, because the mutants that would
 * have died were never generated. `mutation-scopes.json` declares the globs, the floor each
 * scope must hold, and what is left out, so a directory belonging to neither fails by name.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HARNESS, scopesToRun } from "../../scripts/mutation-scopes-to-run.mjs";
import { breakVerdict, scoreOf, strykerArgs } from "../../scripts/run-mutation.mjs";
import { matchesGlob, REPO_ROOT, read, sourceFiles } from "./helpers.js";

interface Scope {
  readonly mutate: string;
  readonly break: number;
}

interface ScopeDeclaration {
  readonly scopes: Readonly<Record<string, Scope>>;
  readonly excluded: Readonly<Record<string, string>>;
}

function declaration(): ScopeDeclaration {
  return JSON.parse(read("mutation-scopes.json")) as ScopeDeclaration;
}

function isCovered(path: string, { scopes, excluded }: ScopeDeclaration): boolean {
  const globs = [...Object.values(scopes).map((scope) => scope.mutate), ...Object.keys(excluded)];
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
    for (const [name, { mutate }] of Object.entries(scopes)) {
      expect(
        files.some((file) => matchesGlob(mutate, file)),
        `scope "${name}" (${mutate}) matches no file — it would score an empty set`
      ).toBe(true);
    }
  });

  it("every scope declares the floor its score must hold", () => {
    for (const [name, scope] of Object.entries(declaration().scopes)) {
      expect(
        Number.isInteger(scope.break) && scope.break > 0 && scope.break <= 100,
        `scope "${name}" declares no break floor — a run cannot fail`
      ).toBe(true);
    }
  });

  it("package.json runs every scope, and nothing it does not", () => {
    const { scripts } = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const scripted = Object.keys(scripts)
      .filter((name) => name.startsWith("test:mutation:"))
      .map((name) => name.slice("test:mutation:".length));

    expect(scripted.sort()).toEqual(Object.keys(declaration().scopes).sort());
  });

  it("no other file lists what mutation covers", () => {
    const stryker = JSON.parse(read("stryker.conf.json")) as Record<string, unknown>;
    expect("mutate" in stryker, "stryker.conf.json declares its own mutate again").toBe(false);
  });
});

describe("the guard itself", () => {
  const scopes = {
    kernel: { mutate: "src/kernel/**/*.ts", break: 70 },
    tools: { mutate: "src/contexts/tools/**/*.ts", break: 60 },
  };

  it("matches a path inside a glob and rejects one outside it", () => {
    expect(matchesGlob("src/kernel/**/*.ts", "src/kernel/ports/logger.ts")).toBe(true);
    expect(matchesGlob("src/kernel/**/*.ts", "src/kernel/tool.ts")).toBe(true);
    expect(matchesGlob("src/kernel/**/*.ts", "src/contexts/tools/domain/registry.ts")).toBe(false);
    expect(matchesGlob("src/cli.ts", "src/cli.ts")).toBe(true);
    expect(matchesGlob("src/cli.ts", "src/clints.ts")).toBe(false);
  });

  it("reports a file no scope and no exclusion names, and clears one a scope covers", () => {
    const declared = { scopes, excluded: { "src/cli.ts": "the entry point" } };
    expect(isCovered("src/kernel/paths.ts", declared)).toBe(true);
    expect(isCovered("src/cli.ts", declared)).toBe(true);
    expect(isCovered("src/contexts/framework/domain/manifest.ts", declared)).toBe(false);
  });

  it("gives each scope its own glob and incremental file, and refuses a scope nobody declared", () => {
    expect(strykerArgs("kernel", scopes)).toEqual([
      "run",
      "--mutate",
      "src/kernel/**/*.ts",
      "--incremental",
      "--incrementalFile",
      "reports/mutation/kernel/incremental.json",
    ]);
    expect(strykerArgs("tools", scopes, { force: true })).toContain("--force");
    expect(() => strykerArgs("nowhere", scopes)).toThrow('Unknown scope "nowhere"');
  });

  it("scores killed and timed-out mutants over everything but the ignored, and an empty report as zero", () => {
    const report = {
      files: {
        "a.ts": {
          mutants: [
            { status: "Killed" },
            { status: "Timeout" },
            { status: "Survived" },
            { status: "NoCoverage" },
            { status: "Ignored" },
          ],
        },
      },
    };
    expect(scoreOf(report)).toBe(50);
    expect(scoreOf({ files: {} })).toBe(0);
  });

  it("runs the scopes a change touches, through source or mirrored tests, and all of them for the harness or a helper", () => {
    expect(scopesToRun(["cli/src/kernel/paths.ts"], scopes)).toEqual(["kernel"]);
    expect(
      scopesToRun(["cli/tests/contexts/tools/domain/registry-conformance.unit.test.ts"], scopes)
    ).toEqual(["tools"]);
    expect(scopesToRun(["README.md"], scopes)).toEqual([]);
    expect(scopesToRun(["cli/tests/helpers/repository-root.ts"], scopes)).toEqual([
      "kernel",
      "tools",
    ]);
    expect(scopesToRun([HARNESS[0]], scopes)).toEqual(["kernel", "tools"]);
    expect(scopesToRun([], scopes, { all: true })).toEqual(["kernel", "tools"]);
  });

  it("names every harness file the tree holds, so a renamed one cannot silently stop counting", () => {
    for (const file of HARNESS) {
      expect(
        existsSync(join(REPO_ROOT, file)),
        `${file} is named in HARNESS but is not there`
      ).toBe(true);
    }
  });

  it("fails a score under the floor and passes one on it", () => {
    expect(breakVerdict(69.9, scopes.kernel)).toMatch(/below the 70/);
    expect(breakVerdict(70, scopes.kernel)).toBeNull();
  });
});

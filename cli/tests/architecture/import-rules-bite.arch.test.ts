/**
 * A biome `noRestrictedImports` pattern is a guard only while the directory it names exists;
 * one naming a deleted path reads as a boundary and forbids nothing. This cannot prove a rule
 * forbids the right thing, only that it can still forbid anything at all.
 */
import { describe, expect, it } from "vitest";
import { read, sourceFiles } from "./helpers.js";

interface RestrictedPattern {
  readonly override: string;
  readonly pattern: string;
}

function restrictedPatterns(): RestrictedPattern[] {
  const config = JSON.parse(read("biome.json")) as {
    overrides?: readonly {
      includes?: readonly string[];
      linter?: {
        rules?: {
          style?: {
            noRestrictedImports?: {
              options?: { patterns?: readonly { group?: readonly string[] }[] };
            };
          };
        };
      };
    }[];
  };
  const out: RestrictedPattern[] = [];
  for (const override of config.overrides ?? []) {
    const scope = (override.includes ?? []).join(", ");
    const groups = override.linter?.rules?.style?.noRestrictedImports?.options?.patterns ?? [];
    for (const { group } of groups) {
      for (const pattern of group ?? []) out.push({ override: scope, pattern });
    }
  }
  return out;
}

/**
 * The literal part of a glob: what biome must find in an import specifier for it to match.
 * `**` + `/application/**` yields `application/`, `../../domain/ports/**` yields `domain/ports/`.
 */
function literalCore(pattern: string): string {
  const core = pattern
    .replace(/^(\.\.\/)+/, "")
    .replace(/^\*\*\//, "")
    .replace(/\/\*\*$/, "/");
  return core.startsWith("/") ? core.slice(1) : core;
}

function matchesSomething(core: string, paths: readonly string[]): boolean {
  const needle = core.endsWith("/") ? core : `${core.replace(/\.js$/, ".ts")}`;
  return paths.some((path) => `${path}/`.includes(`/${needle}`));
}

describe("import rules still bite", () => {
  it("no restricted-import pattern names a path the refactor deleted", () => {
    const paths = sourceFiles();
    const dead = restrictedPatterns()
      .filter(({ pattern }) => !matchesSomething(literalCore(pattern), paths))
      .map(({ override, pattern }) => `${override}: ${pattern}`);

    expect(
      dead,
      "pattern matches nothing under src/ — the rule it belongs to forbids nothing"
    ).toEqual([]);
  });
});

describe("the guard itself", () => {
  it("checks a real rule and flags a deleted one", () => {
    const paths = ["src/contexts/translate/domain/canon.ts", "src/runtime/wiring/translate.ts"];
    expect(matchesSomething(literalCore("**/runtime/**"), paths)).toBe(true);
    expect(matchesSomething(literalCore("**/application/use-cases/**"), paths)).toBe(false);
    expect(literalCore("../../../domain/ports/**")).toBe("domain/ports/");
    expect(literalCore("**/manifest.js")).toBe("manifest.js");
  });
});

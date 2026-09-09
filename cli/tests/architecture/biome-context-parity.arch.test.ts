/**
 * Measured: biome replaces a rule's whole `options` with the LAST override matching a file
 * rather than merging pattern arrays, so a broader override silently discards a narrower
 * one's restriction. Every override checked here is scoped to one context's one layer.
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED,
  baselineLayers,
  contextNames,
  matchesGlob,
  read,
  sourceFiles,
} from "./helpers.js";

type Layer = "domain" | "application" | "infrastructure";
const LAYERS: readonly Layer[] = ["domain", "application", "infrastructure"];

interface BiomeOverride {
  readonly includes?: readonly string[];
  readonly linter?: {
    readonly rules?: {
      readonly style?: {
        readonly noRestrictedImports?: {
          readonly options?: {
            readonly patterns?: readonly { readonly group?: readonly string[] }[];
          };
        };
      };
    };
  };
}

function biomeOverrides(): BiomeOverride[] {
  const config = JSON.parse(read("biome.json")) as { overrides?: BiomeOverride[] };
  return config.overrides ?? [];
}

function restrictedImportGroups(override: BiomeOverride): string[] | undefined {
  const patterns = override.linter?.rules?.style?.noRestrictedImports?.options?.patterns;
  if (!patterns) return undefined;
  return patterns.flatMap((entry) => entry.group ?? []);
}

/** `"**\/foo/**"` reads as the context or layer named `foo`; another shape is not a graph
 * edge, and is left as-is for the allowlist below to recognise. */
function tokenOf(pattern: string): string {
  const match = /^\*\*\/([^/]+)\/\*\*$/.exec(pattern);
  return match ? (match[1] as string) : pattern;
}

/**
 * Patterns naming something other than a graph edge, so a deliberate narrower restriction is
 * not read as drift: `distribution` reads a marketplace, never framework's installation
 * record, which is stricter than the edge itself.
 */
const NON_GRAPH_EXTRA: Readonly<Record<string, readonly string[]>> = {
  "distribution/domain": ["**/manifest.js"],
  "distribution/application": ["**/manifest.js"],
};

/** The layer-intrinsic direction: what any file at this layer must not import, whatever its
 * context. */
function genericLayerTargets(layer: Layer): ReadonlySet<string> {
  if (layer === "domain") {
    return new Set(["application", "infrastructure", "presentation", "runtime"]);
  }
  if (layer === "application") return new Set(["infrastructure"]);
  return new Set();
}

/**
 * The layer-intrinsic direction, union every context and presentation/runtime this context may
 * not reach, minus what `ALLOWED` admits and minus the debt `BASELINE` carries at this layer.
 */
function expectedForbidden(
  context: string,
  layer: Layer,
  contexts: readonly string[],
  baselineLayerMap: ReadonlyMap<string, ReadonlySet<string>>
): Set<string> {
  const forbidden = new Set(genericLayerTargets(layer));
  const others = contexts.filter((name) => name !== context);
  for (const target of [...others, "presentation", "runtime"]) {
    const edge = `${context}->${target}`;
    if (ALLOWED.has(edge)) continue;
    if (baselineLayerMap.get(edge)?.has(layer)) continue;
    forbidden.add(target);
  }
  return forbidden;
}

function contextLayerIncludes(context: string, layer: Layer): string {
  return `src/contexts/${context}/${layer}/**/*.ts`;
}

describe("cli/biome.json forbids exactly the edges context-graph.arch.test.ts forbids", () => {
  const overrides = biomeOverrides().filter((override) => restrictedImportGroups(override));
  const contexts = contextNames();
  const baselineLayerMap = baselineLayers(sourceFiles());

  it("finds context/layer overrides to check, so this rule cannot pass by selecting nothing", () => {
    expect(
      overrides.length,
      "no noRestrictedImports override found — the scope of this rule is stale"
    ).toBeGreaterThan(10);
    expect(contexts.length, "no context found under src/contexts/").toBeGreaterThan(3);
  });

  it("at most one noRestrictedImports override matches any source file", () => {
    const restrictedIncludes = overrides.map((override) => override.includes ?? []);
    const matchedByMoreThanOne: string[] = [];

    for (const file of sourceFiles()) {
      const matches = restrictedIncludes.filter((globs) =>
        globs.some((glob) => matchesGlob(glob, file))
      );
      if (matches.length > 1) matchedByMoreThanOne.push(file);
    }

    expect(
      matchedByMoreThanOne,
      "biome replaces a rule's options with the last matching override rather than merging " +
        "them — a file matched by two noRestrictedImports overrides silently loses the first"
    ).toEqual([]);
  });

  it.each(contexts.flatMap((context) => LAYERS.map((layer) => ({ context, layer }))))(
    "$context/$layer forbids exactly what context-graph.arch.test.ts forbids",
    ({ context, layer }) => {
      const includesGlob = contextLayerIncludes(context, layer);
      const override = overrides.find((candidate) => candidate.includes?.includes(includesGlob));
      expect(override, `no override at ${includesGlob}`).toBeDefined();

      const groups = restrictedImportGroups(override as BiomeOverride) ?? [];
      const extra = new Set(NON_GRAPH_EXTRA[`${context}/${layer}`] ?? []);
      const actual = new Set(
        groups.filter((pattern) => !extra.has(pattern)).map((pattern) => tokenOf(pattern))
      );
      const expected = expectedForbidden(context, layer, contexts, baselineLayerMap);

      expect([...actual].sort()).toEqual([...expected].sort());
    }
  );

  it("kernel forbids every context layer, presentation and runtime, unconditionally", () => {
    const override = overrides.find((candidate) =>
      candidate.includes?.includes("src/kernel/**/*.ts")
    );
    expect(override, "no override at src/kernel/**/*.ts").toBeDefined();

    const groups = (restrictedImportGroups(override as BiomeOverride) ?? []).map(tokenOf);
    expect(new Set(groups)).toEqual(
      new Set(["domain", "application", "infrastructure", "presentation", "runtime"])
    );
  });
});

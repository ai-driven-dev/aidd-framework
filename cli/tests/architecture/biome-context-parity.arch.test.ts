/**
 * `cli/biome.json`'s per-context `noRestrictedImports` overrides must forbid exactly the
 * edges `context-graph.arch.test.ts` forbids — no more, no less — derived from its own
 * `ALLOWED` and `BASELINE` data rather than a hand-copied second list that only looks like
 * it agrees. Three living declarations of the same chain (biome, this graph, and
 * `0-contexts.md`) is how a translate rule kept naming paths the refactor had already
 * deleted for six phases; this makes biome answerable to one of the other two instead of
 * to its own memory.
 *
 * A stronger bug sits underneath that agreement, and it is why this file exists rather than
 * a hand check of the JSON: biome replaces a rule's whole `options` with the LAST override
 * matching a file — it does not merge pattern arrays across two overrides that both set the
 * same rule. A generic `src/contexts/*\/domain/**\/*.ts` override and a later, broader
 * `src/contexts/tools/**\/*.ts` override both matched every file under `tools/domain/`, and
 * the broader one silently discarded the narrower one's restriction. Measured, not assumed:
 * `tools/domain/profiles/claude/profile.ts` importing `tools/infrastructure`'s
 * `native-plugin-cli-adapter.ts` passed `biome lint` outright with the old shape. So every
 * override this file checks is scoped to exactly one context's one layer, and the first
 * real test below asserts that shape mechanically rather than trusting it holds.
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

/** `"**\/foo/**"` reads as the context or layer named `foo`; a pattern of a different shape
 * (`"**\/manifest.js"`) is not a graph edge and is left as-is for the known-extra allowlist
 * below to recognise. */
function tokenOf(pattern: string): string {
  const match = /^\*\*\/([^/]+)\/\*\*$/.exec(pattern);
  return match ? (match[1] as string) : pattern;
}

/**
 * Patterns a context/layer override carries that name something other than a context-graph
 * edge — recorded here so this test does not mistake a deliberate, narrower restriction for
 * drift. `distribution` reads a marketplace, never framework's installation record, which is
 * a stricter rule than "distribution may not import framework" (framework itself is
 * exempted at the `application` layer by `BASELINE`'s grandfathered
 * `distribution->framework` edge). Each entry here must still earn its keep:
 * `import-rules-bite.arch.test.ts` fails a pattern that matches nothing under `src/`.
 */
const NON_GRAPH_EXTRA: Readonly<Record<string, readonly string[]>> = {
  "distribution/domain": ["**/manifest.js"],
  "distribution/application": ["**/manifest.js"],
};

/** What every file at this layer must not import, regardless of context — hexagonal's
 * dependency direction, independent of which contexts may speak to which. */
function genericLayerTargets(layer: Layer): ReadonlySet<string> {
  if (layer === "domain") {
    return new Set(["application", "infrastructure", "presentation", "runtime"]);
  }
  if (layer === "application") return new Set(["infrastructure"]);
  return new Set();
}

/**
 * What a context's own layer must forbid: the layer-intrinsic direction above, union the
 * other contexts and presentation/runtime this context may not reach — every one of those
 * minus what `ALLOWED` admits and minus whichever ones already carry `BASELINE`'s debt at
 * this exact layer, which `baselineLayers` derives from the tree rather than a count typed
 * out a second time beside it.
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

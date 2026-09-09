/**
 * The context chain as a graph rather than a paragraph. A per-file biome override cannot see
 * it: an override matches the text of a specifier, not the path it resolves to, and answers
 * one file at a time. `presentation` and `runtime` may depend on anything below them, so a
 * context reaching back into either is an edge recorded here. Data lives in `helpers.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED,
  BASELINE,
  contextOf,
  edgesBetweenContexts,
  expectRatchet,
  sourceFiles,
  weighedEdges,
} from "./helpers.js";

function forbiddenEdges(edges: readonly string[], allowed: ReadonlySet<string>): string[] {
  return edges.filter((edge) => !allowed.has(edge));
}

function edgeBetween(importer: string, target: string): string {
  return `${contextOf(importer)}->${contextOf(target)}`;
}

describe("the context graph has only the edges the plan allows", () => {
  it("no context reaches another the chain does not permit", () => {
    const violations = forbiddenEdges(edgesBetweenContexts(sourceFiles()), ALLOWED);

    const { added, fixed } = expectRatchet(
      violations,
      BASELINE.map((entry) => entry.edge)
    );
    expect(added, "an edge the chain forbids — see arborescence.md invariant 2").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("holds each admitted edge to the weight its reason was written around", () => {
    const weighed = weighedEdges(sourceFiles());
    const recorded = BASELINE.map(
      ({ edge, imports, files }) => `${edge}: ${imports} imports across ${files} files`
    );
    const actual = BASELINE.map(({ edge }) => {
      const weight = weighed.get(edge) ?? { imports: 0, files: 0 };
      return `${edge}: ${weight.imports} imports across ${weight.files} files`;
    });

    expect(
      actual,
      "an admitted edge absorbed imports — a baselined edge is not a licence to grow"
    ).toEqual(recorded);
  });
});

describe("the guard itself", () => {
  it("names the edge it is given, and stays silent on one it allows", () => {
    expect(contextOf("src/contexts/tools/domain/registry.ts")).toBe("tools");
    expect(contextOf("src/kernel/tool.ts")).toBe("kernel");
    expect(contextOf("src/somewhere-that-is-no-layer/thing.ts")).toBe("outside");
    expect(ALLOWED.has("translate->tools")).toBe(true);
    expect(ALLOWED.has("tools->translate")).toBe(false);
  });

  it("reports a planted crossing the chain forbids and clears one it permits", () => {
    const forbidden = edgeBetween(
      "src/contexts/tools/domain/registry.ts",
      "src/contexts/translate/domain/canon.ts"
    );
    const permitted = edgeBetween(
      "src/contexts/translate/application/translate-source.ts",
      "src/contexts/tools/domain/registry.ts"
    );

    expect(forbiddenEdges([forbidden, permitted], ALLOWED)).toEqual(["tools->translate"]);
    expect(forbiddenEdges([permitted], ALLOWED)).toEqual([]);
  });
});

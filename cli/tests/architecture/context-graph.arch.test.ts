/**
 * The chain the whole plan rests on, as a graph rather than a paragraph.
 *
 * `arborescence.md` invariant 2 allows exactly these edges between contexts:
 * `framework → translate`, `translate → tools`, `framework → distribution`, and every
 * context to the kernel. `framework → tools` is allowed too: framework installs for a
 * tool and must name it.
 *
 * Per-file biome overrides cannot see this. They match the text of a specifier, not the
 * path it resolves to, and they answer one file at a time — which is how twenty-three
 * forbidden edges survived until the graph was drawn.
 *
 * Since phase 16 the two non-context layers have names and a direction of their own:
 * `presentation` speaks to a human and may depend on anything below it, `runtime` wires
 * and provides technical services. Invariant 1 says the arrows run one way — presentation
 * to contexts to kernel — so a context reaching back into either is recorded here rather
 * than left to prose. It was left to prose until now, and three such imports appeared
 * without a test noticing.
 *
 * ALLOWED, BASELINE and the edge-walking machinery live in `helpers.ts` now: this is the
 * one place they are declared, so `biome-context-parity.arch.test.ts` checks
 * `cli/biome.json`'s own per-context overrides against this same data instead of a second,
 * hand-copied list that only looks like it agrees.
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

describe("the context graph has only the edges the plan allows", () => {
  it("no context reaches another the chain does not permit", () => {
    const violations = edgesBetweenContexts(sourceFiles()).filter((edge) => !ALLOWED.has(edge));

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

  it("names the edge it is given, and stays silent on one it allows", () => {
    expect(contextOf("src/contexts/tools/domain/registry.ts")).toBe("tools");
    expect(contextOf("src/kernel/tool.ts")).toBe("kernel");
    expect(contextOf("src/somewhere-that-is-no-layer/thing.ts")).toBe("outside");
    expect(ALLOWED.has("translate->tools")).toBe(true);
    expect(ALLOWED.has("tools->translate")).toBe(false);
  });
});

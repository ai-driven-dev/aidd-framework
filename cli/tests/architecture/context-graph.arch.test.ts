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
 */
import { readFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_ROOT, expectRatchet, sourceFiles } from "./helpers.js";

const ALLOWED = new Set([
  "framework->translate",
  "framework->tools",
  "framework->distribution",
  "translate->tools",
]);

/** Edges that exist and should not. This list may only shrink. */
/**
 * Edges the chain forbids and the tree still has. The list may only shrink, and each entry
 * carries what it admits, measured — an edge alone says nothing about its weight, so a
 * baselined edge could absorb any number of new imports in silence. `folder-size` already
 * counts its entries; this carries the same shape here.
 *
 * That the counts were missing is not theoretical. The single comment below used to cover
 * two edges at once and got both wrong: it said "fourteen context files import runtime"
 * where `framework` has eleven, and named "the http client and the git token injection" as
 * `framework`'s two implementations when they are `distribution`'s, which has three.
 * `distribution->runtime` sat under that comment with no reason of its own.
 */
const BASELINE: readonly {
  readonly edge: string;
  readonly imports: number;
  readonly files: number;
}[] = [
  // `marketplace add --overwrite` removes before it adds, and removing deletes the
  // installed plugin files — framework work. The orchestration belongs to whoever calls
  // both, not to the context that only knows where content comes from.
  { edge: "distribution->framework", imports: 1, files: 1 },
  // Three implementations and one port: the http client, the git token injection and the
  // user-config directory are concrete, so this edge is a real dependency on runtime and
  // not a misplaced contract. It resolves by inverting them into ports this context holds.
  { edge: "distribution->runtime", imports: 5, files: 3 },
  // Three framework orchestrators still name the prompt classes they are handed. Type-only
  // imports with unchanged signatures — inverting them into a port is a design change, not
  // the move phase 16 was. Recorded so it is measured rather than remembered.
  { edge: "framework->presentation", imports: 4, files: 3 },
  // Four targets, every one an interface: token provider, platform, latest release
  // resolver, version reader. Those are contracts a context is entitled to depend on,
  // sitting in the wrong place — a port used by two contexts belongs in the kernel, as
  // phase 9 established. Nothing concrete crosses here.
  { edge: "framework->runtime", imports: 13, files: 11 },
];

function contextOf(file: string): string {
  const inContext = /^src\/contexts\/([^/]+)\//.exec(file);
  if (inContext) return inContext[1];
  if (file.startsWith("src/kernel/")) return "kernel";
  if (file.startsWith("src/presentation/")) return "presentation";
  if (file.startsWith("src/runtime/")) return "runtime";
  return "outside";
}

/** A layer a context may not depend on: the arrows run towards the kernel, never back. */
const BELOW_NOTHING = new Set(["presentation", "runtime"]);

function isContext(name: string): boolean {
  return !BELOW_NOTHING.has(name) && name !== "kernel" && name !== "outside";
}

const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*["'](\.[^"']+\.js)["']/g;

/** Every context-to-context edge the import graph contains, with how much crosses each. */
function weighedEdges(files: readonly string[]): Map<string, { imports: number; files: number }> {
  const found = new Map<string, { imports: number; files: Set<string> }>();
  for (const file of files) {
    const from = contextOf(file);
    const source = readFileSync(join(CLI_ROOT, file), "utf8");
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      const target = normalize(
        relative(CLI_ROOT, resolve(CLI_ROOT, dirname(file), match[1])).replace(/\.js$/, ".ts")
      );
      const to = contextOf(target);
      if (from === to || to === "kernel" || from === "outside" || to === "outside") continue;
      // presentation and runtime may reach down; only the reverse is an edge worth naming
      if (BELOW_NOTHING.has(from)) continue;
      if (BELOW_NOTHING.has(to) && !isContext(from)) continue;
      const edge = `${from}->${to}`;
      const weight = found.get(edge) ?? { imports: 0, files: new Set<string>() };
      weight.imports += 1;
      weight.files.add(file);
      found.set(edge, weight);
    }
  }
  return new Map(
    [...found].map(([edge, weight]) => [
      edge,
      { imports: weight.imports, files: weight.files.size },
    ])
  );
}

/** Every context-to-context edge the import graph actually contains. */
function edgesBetweenContexts(files: readonly string[]): string[] {
  return [...weighedEdges(files).keys()].sort();
}

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

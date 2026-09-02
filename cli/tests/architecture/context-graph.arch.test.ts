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
const BASELINE = [
  // `marketplace add --overwrite` removes before it adds, and removing deletes the
  // installed plugin files — framework work. The orchestration belongs to whoever
  // calls both, not to the context that only knows where content comes from.
  "distribution->framework",
  // Three framework orchestrators still name the prompt classes they are handed. A
  // type-only import with an unchanged signature — inverting it into a port is a design
  // change, not the move phase 16 was. Recorded so it is measured rather than remembered.
  "framework->presentation",
  // Fourteen context files import runtime, and what they import is almost entirely
  // ports: version reader, platform, token provider, latest release resolver. Those are
  // contracts a context is entitled to depend on, sitting in the wrong place — a port
  // used by two contexts belongs in the kernel, as phase 9 established. Two are genuine:
  // the http client and the git token injection are implementations.
  "framework->runtime",
  "distribution->runtime",
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

/** Every context-to-context edge the import graph actually contains. */
function edgesBetweenContexts(files: readonly string[]): string[] {
  const found = new Set<string>();
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
      found.add(`${from}->${to}`);
    }
  }
  return [...found].sort();
}

describe("the context graph has only the edges the plan allows", () => {
  it("no context reaches another the chain does not permit", () => {
    const violations = edgesBetweenContexts(sourceFiles()).filter((edge) => !ALLOWED.has(edge));

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "an edge the chain forbids — see arborescence.md invariant 2").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("names the edge it is given, and stays silent on one it allows", () => {
    expect(contextOf("src/contexts/tools/domain/registry.ts")).toBe("tools");
    expect(contextOf("src/kernel/tool.ts")).toBe("kernel");
    expect(contextOf("src/application/commands/ai.ts")).toBe("outside");
    expect(ALLOWED.has("translate->tools")).toBe(true);
    expect(ALLOWED.has("tools->translate")).toBe(false);
  });
});

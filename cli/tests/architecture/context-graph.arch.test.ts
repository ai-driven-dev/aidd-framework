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
 * `outside` is what no context has claimed yet: the command surface, the runtime
 * services, the interactive menu. Its edges are unconstrained here on purpose; phases 16
 * and 18 place it, and constraining it now would freeze a layout still being decided.
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
];

function contextOf(file: string): string {
  const inContext = /^src\/contexts\/([^/]+)\//.exec(file);
  if (inContext) return inContext[1];
  if (file.startsWith("src/kernel/")) return "kernel";
  return "outside";
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

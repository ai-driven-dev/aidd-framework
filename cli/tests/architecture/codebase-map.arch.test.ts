/**
 * The map matches the ground.
 *
 * `aidd_docs/memory/codebase-map.md` is the single place that describes where things
 * live — the architecture rules deliberately carry no paths. A map maintained by hand
 * drifts silently: five real directories were missing from it when this test was written.
 */
import { describe, expect, it } from "vitest";
import { read, sourceFiles } from "./helpers.js";

const MAP = "aidd_docs/memory/codebase-map.md";

/** Directory names a tree block draws, from its raw text. */
function mappedDirectoriesInText(text: string): Set<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(/[│├└─\s]([a-z][a-z-]*)\/[\s#]/g)) names.add(match[1]);
  return names;
}

function mappedDirectories(): Set<string> {
  return mappedDirectoriesInText(read(MAP));
}

/** Directory names that actually exist under `src/`. */
function realDirectories(): Set<string> {
  const names = new Set<string>();
  for (const file of sourceFiles()) {
    for (const segment of file.split("/").slice(1, -1)) names.add(segment);
  }
  return names;
}

/** The rule itself: which real directories the map is silent about. */
function undocumented(real: ReadonlySet<string>, mapped: ReadonlySet<string>): string[] {
  return [...real].filter((dir) => !mapped.has(dir)).sort();
}

describe("the codebase map matches the tree", () => {
  it("every directory under src/ appears in the map", () => {
    const missing = undocumented(realDirectories(), mappedDirectories());
    expect(missing, `${MAP} does not mention these directories`).toEqual([]);
  });

  it("flags a real directory absent from the tree block and clears one drawn in it", () => {
    const treeText =
      "├── kernel/           # shared vocabulary\n└── domain/           # business rules\n";

    const mapped = mappedDirectoriesInText(treeText);
    expect(undocumented(new Set(["kernel", "ghost"]), mapped)).toEqual(["ghost"]);
  });
});

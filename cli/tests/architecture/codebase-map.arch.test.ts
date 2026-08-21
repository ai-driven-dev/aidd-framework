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

/** Directory names the map draws, from its tree block. */
function mappedDirectories(): Set<string> {
  const names = new Set<string>();
  for (const match of read(MAP).matchAll(/[│├└─\s]([a-z][a-z-]*)\/[\s#]/g)) names.add(match[1]);
  return names;
}

/** Directory names that actually exist under `src/`. */
function realDirectories(): Set<string> {
  const names = new Set<string>();
  for (const file of sourceFiles()) {
    for (const segment of file.split("/").slice(1, -1)) names.add(segment);
  }
  return names;
}

describe("the codebase map matches the tree", () => {
  it("every directory under src/ appears in the map", () => {
    const mapped = mappedDirectories();
    const missing = [...realDirectories()].filter((dir) => !mapped.has(dir)).sort();
    expect(missing, `${MAP} does not mention these directories`).toEqual([]);
  });
});

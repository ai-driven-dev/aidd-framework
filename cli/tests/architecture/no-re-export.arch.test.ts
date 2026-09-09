/**
 * Biome sees neither form: `noBarrelFile` only sees a file that does nothing but re-export and
 * `noReExportAll` only `export *`. A module re-exporting a name it does not own becomes a
 * second source of truth for it, which is what makes a hub.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, read, sourceFiles } from "./helpers.js";

/** `export … from "…"` — a re-export written in one statement. */
const INLINE_RE_EXPORT = /^export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*(?:as\s+\w+\s*)?from\s+["']/m;

/** `export { X };` or `export type { X };` — re-exporting a name imported above. */
const BARE_RE_EXPORT = /^export\s+(?:type\s+)?\{[^}]*\};$/m;

/** Files re-exporting a symbol they do not define. This list may only shrink. */
const BASELINE: string[] = [];

function reExports(source: string): boolean {
  return INLINE_RE_EXPORT.test(source) || BARE_RE_EXPORT.test(source);
}

describe("no module re-exports another module's symbol", () => {
  it("every symbol is imported from the module that defines it", () => {
    const violations = sourceFiles().filter((file) => reExports(read(file)));

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "re-export — import the symbol from its source instead").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });
});

describe("the guard itself", () => {
  it("flags both re-export forms and clears a plain import", () => {
    expect(reExports('export { thing } from "./thing.js";')).toBe(true);
    expect(reExports('import { thing } from "./thing.js";\nexport { thing };')).toBe(true);
    expect(
      reExports('import { thing } from "./thing.js";\nexport function use() { return thing; }')
    ).toBe(false);
  });
});

/**
 * A symbol is imported from where it is defined, never through a hub.
 *
 * Biome cannot enforce this on its own: `noBarrelFile` only sees files that do
 * nothing but re-export, and `noReExportAll` only sees `export *`. The form that
 * actually accumulated here is narrower and invisible to both — a module importing
 * a symbol and exporting it again, either inline (`export … from`) or as a bare
 * `export { X };` after a plain import. Each one turns a module into a second
 * source of truth for a name it does not own, which is what makes a hub.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, read, sourceFiles } from "./helpers.js";

/** `export … from "…"` — a re-export written in one statement. */
const INLINE_RE_EXPORT = /^export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*(?:as\s+\w+\s*)?from\s+["']/m;

/** `export { X };` or `export type { X };` — re-exporting a name imported above. */
const BARE_RE_EXPORT = /^export\s+(?:type\s+)?\{[^}]*\};$/m;

/** Files re-exporting a symbol they do not define. This list may only shrink. */
const BASELINE: string[] = [];

describe("no module re-exports another module's symbol", () => {
  it("every symbol is imported from the module that defines it", () => {
    const violations = sourceFiles().filter((file) => {
      const source = read(file);
      return INLINE_RE_EXPORT.test(source) || BARE_RE_EXPORT.test(source);
    });

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "re-export — import the symbol from its source instead").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });
});

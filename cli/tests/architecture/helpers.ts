/**
 * Shared source-graph helpers for architecture tests.
 *
 * These tests read source as text. They never import the code under test, so they
 * stay fast enough for a pre-commit hook and cannot be broken by runtime wiring.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

export const CLI_ROOT = resolve(import.meta.dirname, "..", "..");
export const SRC = join(CLI_ROOT, "src");

/** Every `.ts` file under `src/`, as paths relative to the cli package root. */
export function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) out.push(relative(CLI_ROOT, full));
    }
  };
  walk(SRC);
  return out.sort();
}

export function read(relativePath: string): string {
  return readFileSync(join(CLI_ROOT, relativePath), "utf8");
}

const RELATIVE_IMPORT = /(?:from\s+|import\s+)["'](\.[^"']+)["']/g;

/**
 * Maps every source file to the set of files importing it.
 * Side-effect imports (`import "./x.js"`) count: that is how tools register themselves.
 */
export function importersByFile(): Map<string, Set<string>> {
  const files = sourceFiles();
  const known = new Set(files);
  const importers = new Map<string, Set<string>>();
  for (const file of files) {
    const text = read(file);
    for (const match of text.matchAll(RELATIVE_IMPORT)) {
      const target = normalize(join(dirname(file), match[1])).replace(/\.js$/, ".ts");
      if (!known.has(target)) continue;
      const set = importers.get(target) ?? new Set<string>();
      set.add(file);
      importers.set(target, set);
    }
  }
  return importers;
}

/**
 * Compares current violations against a frozen baseline.
 *
 * The baseline may only shrink. A new violation fails immediately; removing one
 * without updating the baseline also fails, so the list stays honest.
 */
export function expectRatchet(
  current: readonly string[],
  baseline: readonly string[]
): { added: string[]; fixed: string[] } {
  const base = new Set(baseline);
  const now = new Set(current);
  return {
    added: current.filter((entry) => !base.has(entry)).sort(),
    fixed: baseline.filter((entry) => !now.has(entry)).sort(),
  };
}

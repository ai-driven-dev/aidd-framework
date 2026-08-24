import { join } from "node:path";

export const AIDD_DIR = ".aidd";
export const AIDD_CONFIG_FILENAME = "config.json";
export const DOCS_DIR = "aidd_docs" as const;
export const PLUGIN_CACHE_SUBDIR = join(AIDD_DIR, "plugin-cache");
export const MARKETPLACE_CACHE_SUBDIR = join(AIDD_DIR, "cache", "marketplaces");
export const BUILT_CACHE_SUBDIR = join(AIDD_DIR, "cache", "built");

export function marketplaceCacheDir(projectRoot: string, marketplaceName: string): string {
  return join(projectRoot, MARKETPLACE_CACHE_SUBDIR, marketplaceName);
}

export function builtMarketplaceDir(
  projectRoot: string,
  marketplaceName: string,
  target: string
): string {
  return join(projectRoot, BUILT_CACHE_SUBDIR, marketplaceName, target);
}

// One directory is the other, or contains it. Two callers guard on this - a build refusing
// to write into the tree it reads from, and the cache-rebuild path deciding whether it
// needs the temp-dir detour - and each spelled the comparison itself with a hardcoded "/",
// so on Windows neither ever recognised real nesting. Named once here so the
// question has an answer to point at rather than a habit to repeat. Both sides are
// expected already resolved: this compares spelling, it does not resolve.
export function pathContainsOrEquals(outer: string, inner: string): boolean {
  const normalizedOuter = outer.replace(/\\/g, "/");
  const normalizedInner = inner.replace(/\\/g, "/");
  return normalizedOuter === normalizedInner || normalizedInner.startsWith(`${normalizedOuter}/`);
}

/** Either direction: neither may sit inside the other. */
export function pathsOverlap(a: string, b: string): boolean {
  return pathContainsOrEquals(a, b) || pathContainsOrEquals(b, a);
}

import { join } from "node:path";

export const AIDD_DIR = ".aidd";
export const AIDD_CONFIG_FILENAME = "config.json";
/** The project-scope marketplace registry, named once: `MarketplaceRegistryAdapter` writes
 * it and `CleanUseCase` removes it, and a second spelling is how one of them forgets. */
export const AIDD_MARKETPLACES_FILENAME = "marketplaces.json";
export const DOCS_DIR = "aidd_docs" as const;
export const RUNS_SUBDIR = "runs" as const;
export const PLUGIN_CACHE_SUBDIR = join(AIDD_DIR, "plugin-cache");
export const MARKETPLACE_CACHE_SUBDIR = join(AIDD_DIR, "cache", "marketplaces");
export const BUILT_CACHE_SUBDIR = join(AIDD_DIR, "cache", "built");

// The one spelling of "the run journal's directory, as a gitignore/pathspec entry" -
// `telemetry-on-use-case.ts`'s `protectRunsDir` and `forget-telemetry-use-case.ts`'s
// history check both ask `VersionControl.listTrackedFiles` about exactly this path; a
// second literal of the same string would be a second way of asking the same question.
export const RUNS_ENTRY = `${DOCS_DIR}/${RUNS_SUBDIR}/`;

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

/** The manifest's filename, in the domain because two adapters name that file and a
 * diagnostic prints both. `telemetry-evidence-adapter.ts` scans it for a declaration while
 * `manifest-repository-adapter.ts` loads and validates it, and `aidd telemetry check` prints
 * a row from each — so a person reads two sentences about one file. They agreed by two
 * matching literals until this existed, which is agreement by coincidence: renaming the file
 * at one site would have made the rows contradict each other again, which is the defect that
 * pairing was introduced to close. */
export const MANIFEST_FILENAME = "manifest.json";

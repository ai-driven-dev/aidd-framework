import { join, posix, win32 } from "node:path";
import { repositoryRootAbove } from "./reading/repository-root.js";

export const AIDD_DIR = ".aidd";
export const AIDD_CONFIG_FILENAME = "config.json";
/** The project-scope marketplace registry, named once: `MarketplaceRegistryAdapter` writes
 * it and `CleanUseCase` removes it, and a second spelling is how one of them forgets. */
export const AIDD_MARKETPLACES_FILENAME = "marketplaces.json";
/** The registry of projects referencing the shared machine-scope source, named once for the
 * same reason as `AIDD_MARKETPLACES_FILENAME`: one adapter writes it, a machine-scope
 * `clean` purges it, and a second spelling is how one of them forgets the other. */
export const USER_SOURCE_REFERENCES_FILENAME = "references.json";
export const DOCS_DIR = "aidd_docs" as const;
export const RUNS_SUBDIR = "runs" as const;
export const PLUGIN_CACHE_SUBDIR = join(AIDD_DIR, "plugin-cache");
export const MARKETPLACE_CACHE_SUBDIR = join(AIDD_DIR, "cache", "marketplaces");
export const BUILT_CACHE_SUBDIR = join(AIDD_DIR, "cache", "built");

// The one spelling of "the run journal's directory, as a gitignore/pathspec entry":
// `telemetry-on-use-case.ts` and `forget-telemetry-use-case.ts` both ask
// `VersionControl.listTrackedFiles` about exactly this path.
export const RUNS_ENTRY = `${DOCS_DIR}/${RUNS_SUBDIR}/`;

/**
 * Where the run journal lives — at the repository root above `projectRoot`, never
 * `projectRoot` itself, because the hook that writes it anchors there (`repositoryRootAbove`
 * carries why). The one resolver, so two readers cannot disagree from a subdirectory.
 * `AIDD_RUNS_DIR` overrides it outright, matching the hook.
 */
export function resolvedRunsDir(projectRoot: string): string {
  return process.env.AIDD_RUNS_DIR || join(repositoryRootAbove(projectRoot), DOCS_DIR, RUNS_SUBDIR);
}

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

/** The directory every version's own built tree sits under — `clean --scope user`'s
 * whole-source purge target, three segments above `userBuiltMarketplaceDir`. Named once so
 * the version-scoped path and the root holding every version cannot drift apart. */
export function userBuiltCacheRoot(userConfigDir: string): string {
  return join(userConfigDir, "cache", "built");
}

/** The CLI version sits before the marketplace name, so purging one version is a single
 * `rm -rf` and two projects on two CLI versions never resolve to the same directory — what
 * keeps a second project from silently repointing a host away from the first. */
export function userBuiltMarketplaceDir(
  userConfigDir: string,
  cliVersion: string,
  marketplaceName: string,
  target: string
): string {
  return join(userBuiltCacheRoot(userConfigDir), cliVersion, marketplaceName, target);
}

/** What `userBuiltMarketplaceDir` encoded into a path, read back. */
export interface UserBuiltMarketplaceLocation {
  readonly version: string;
  readonly marketplaceName: string;
  readonly target: string;
}

/**
 * The inverse of `userBuiltMarketplaceDir`: the version/name/target `path` carries when it
 * has exactly that shape under `userConfigDir`, `undefined` otherwise. Decided from the
 * path's own segments, so a host's registered source is told apart from another version of
 * the shared build without opening any catalog.
 */
export function parseUserBuiltMarketplaceDir(
  userConfigDir: string,
  path: string,
  platform: string = process.platform
): UserBuiltMarketplaceLocation | undefined {
  const segments = segmentsUnder(userBuiltCacheRoot(userConfigDir), path, platform);
  if (segments === undefined || segments.length !== 3) return undefined;
  const [version, marketplaceName, target] = segments;
  return { version, marketplaceName, target };
}

/** What `builtMarketplaceDir` encoded into a path, read back. */
export interface BuiltMarketplaceLocation {
  readonly marketplaceName: string;
  readonly target: string;
}

/** The inverse of `builtMarketplaceDir`, decided from the path's own segments the way
 * `parseUserBuiltMarketplaceDir` decides the user-scope shape. */
export function parseBuiltMarketplaceDir(
  projectRoot: string,
  path: string,
  platform: string = process.platform
): BuiltMarketplaceLocation | undefined {
  const segments = segmentsUnder(join(projectRoot, BUILT_CACHE_SUBDIR), path, platform);
  if (segments === undefined || segments.length !== 2) return undefined;
  const [marketplaceName, target] = segments;
  return { marketplaceName, target };
}

/** `builtMarketplaceDir`'s own shape plus the project root that produced it — the root
 * `parseBuiltMarketplaceDir` has to be handed and this one exists to discover. */
export interface AnyProjectBuiltMarketplaceLocation extends BuiltMarketplaceLocation {
  readonly projectRoot: string;
}

/** Matched segment by segment, never by index arithmetic over a case-folded string: win32
 * folding need not preserve length. `projectRoot` is rejoined with `platform`'s own separator,
 * since every other writer of `references.json` records a backslash `realpath` on win32 and
 * `samePathSegment` compares spelling. */
export function parseBuiltMarketplaceDirAtAnyRoot(
  path: string,
  platform: string = process.platform
): AnyProjectBuiltMarketplaceLocation | undefined {
  const segments = stripTrailingSeparator(path.replace(/\\/g, "/")).split("/");
  const marker = BUILT_CACHE_SUBDIR.replace(/\\/g, "/").split("/");
  const markerStart = segments.length - marker.length - 2;
  if (markerStart < 1) return undefined;
  const candidateMarker = segments.slice(markerStart, markerStart + marker.length);
  const markerMatches = candidateMarker.every(
    (segment, index) =>
      marker[index] !== undefined && samePathSegment(segment, marker[index], platform)
  );
  if (!markerMatches) return undefined;
  const projectRoot = segments.slice(0, markerStart).join(platform === "win32" ? "\\" : "/");
  if (projectRoot.length === 0) return undefined;
  const [marketplaceName, target] = segments.slice(markerStart + marker.length);
  if (marketplaceName === undefined || target === undefined) return undefined;
  return { projectRoot, marketplaceName, target };
}

/** The path segments of `path` past `base`, `undefined` when `path` does not sit under
 * `base`. Compares spelling — folded by `platform` for the containment test only, so the
 * segments returned keep their original casing — and resolves neither side. A trailing
 * separator on `base` is tolerated. */
function segmentsUnder(base: string, path: string, platform: string): string[] | undefined {
  const normalizedBase = stripTrailingSeparator(base.replace(/\\/g, "/"));
  const normalizedPath = stripTrailingSeparator(path.replace(/\\/g, "/"));
  const compareBase = foldCase(normalizedBase, platform);
  const comparePath = foldCase(normalizedPath, platform);
  if (!comparePath.startsWith(`${compareBase}/`)) return undefined;
  const remainder = normalizedPath.slice(normalizedBase.length + 1);
  if (remainder.length === 0) return undefined;
  return remainder.split("/");
}

function stripTrailingSeparator(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

function foldCase(p: string, platform: string): string {
  return platform === "win32" ? p.toLowerCase() : p;
}

/** Whether two path segments name the same thing, folded the way a case-insensitive
 * filesystem would: identical spelling everywhere but win32, where the comparison ignores
 * case. `platform` is a parameter, never `process.platform` read inline, so a test can
 * exercise the win32 branch on any OS. */
export function samePathSegment(
  a: string,
  b: string,
  platform: string = process.platform
): boolean {
  return platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** `roots` with every `samePathSegment` duplicate collapsed away, the first spelling kept.
 * A plain `Set` compares by exact string equality, so on win32 two entries differing only
 * in case — one directory the filesystem never tells apart — would survive as two. */
export function dedupePathSegments(
  roots: readonly string[],
  platform: string = process.platform
): string[] {
  const deduped: string[] = [];
  for (const root of roots) {
    if (!deduped.some((seen) => samePathSegment(seen, root, platform))) deduped.push(root);
  }
  return deduped;
}

// One directory is the other, or contains it — separators normalised, so nesting is
// recognised on Windows too. Both sides are expected already resolved: this compares
// spelling, it does not resolve.
export function pathContainsOrEquals(outer: string, inner: string): boolean {
  const normalizedOuter = outer.replace(/\\/g, "/");
  const normalizedInner = inner.replace(/\\/g, "/");
  return normalizedOuter === normalizedInner || normalizedInner.startsWith(`${normalizedOuter}/`);
}

/** Either direction: neither may sit inside the other. */
export function pathsOverlap(a: string, b: string): boolean {
  return pathContainsOrEquals(a, b) || pathContainsOrEquals(b, a);
}

/** Where the user-scope manifest lives: directly under `userConfigDir()`, never nested in an
 * `.aidd/` segment — there is no project to hold one, and `marketplaces.json` and
 * `references.json` sit at that same root already. */
export function userManifestPath(userConfigDir: string): string {
  return join(userConfigDir, MANIFEST_FILENAME);
}

/** The manifest's filename, named once because `telemetry-evidence-adapter.ts` and
 * `manifest-repository-adapter.ts` both open that file and `aidd telemetry check` prints a
 * row from each: two literals would let a rename make those rows contradict each other. */
export const MANIFEST_FILENAME = "manifest.json";

/**
 * `target` relative to `base`, spelled with forward slashes whatever the platform — the form
 * every path this CLI records for another machine to read takes (a manifest's
 * `files[].relativePath`, a snapshot key, a plugin ref), so a tree written on Windows and
 * read on Linux names the same file.
 */
export function posixRelative(
  base: string,
  target: string,
  platform: NodeJS.Platform = process.platform
): string {
  const impl = platform === "win32" ? win32 : posix;
  return impl.relative(base, target).split(impl.sep).join("/");
}

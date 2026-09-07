import { join } from "node:path";
import { repositoryRootAbove } from "./reading/repository-root.js";

export const AIDD_DIR = ".aidd";
export const AIDD_CONFIG_FILENAME = "config.json";
/** The project-scope marketplace registry, named once: `MarketplaceRegistryAdapter` writes
 * it and `CleanUseCase` removes it, and a second spelling is how one of them forgets. */
export const AIDD_MARKETPLACES_FILENAME = "marketplaces.json";
/** The registry of projects that reference the shared machine-scope source, named once
 * for the same reason as `AIDD_MARKETPLACES_FILENAME`: `UserSourceReferencesAdapter`
 * writes it, and a future machine-scope `clean` purges it — a second spelling is how one
 * of them would forget the other. */
export const USER_SOURCE_REFERENCES_FILENAME = "references.json";
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

/**
 * Where the run journal actually lives — at the repository root above `projectRoot`, never
 * `projectRoot` itself. The hook that writes it anchors at `git rev-parse --show-toplevel`
 * (`repositoryRootAbove`'s own doc explains why), so a session started from a subdirectory
 * of a checkout still writes one journal at the checkout's root; a reader that joined
 * straight onto `projectRoot` instead found nothing there.
 *
 * The one resolver: `RunJournalReaderAdapter` and `TelemetryEvidenceAdapter` used to derive
 * this independently — one walked up to the repository root, the other did not — and
 * disagreed from any subdirectory. `AIDD_RUNS_DIR` overrides it outright, matching the hook.
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

/**
 * Where a user-scope marketplace's built tree lives: under the CLI's own user
 * directory, which is already the `.aidd` of the user, so the layout below it repeats
 * the project one without repeating the `.aidd` segment.
 *
 * The CLI version sits before the marketplace name, not after: a purge of one
 * version is then a single `rm -rf` on a directory this CLI alone owns, and two
 * projects on two different CLI versions never resolve to the same directory — the
 * one shape that lets a second project coexist with a first without one silently
 * repointing the host away from the other (measured against the real `claude`,
 * `codex` and `copilot` binaries: only a version-carrying path makes that safe).
 */
export function userBuiltMarketplaceDir(
  userConfigDir: string,
  cliVersion: string,
  marketplaceName: string,
  target: string
): string {
  return join(userConfigDir, "cache", "built", cliVersion, marketplaceName, target);
}

/** What `userBuiltMarketplaceDir` encoded into a path, read back. */
export interface UserBuiltMarketplaceLocation {
  readonly version: string;
  readonly marketplaceName: string;
  readonly target: string;
}

/**
 * The inverse of `userBuiltMarketplaceDir`: whether `path` has exactly that shape
 * under `userConfigDir`, and if so, the version/name/target it carries — `undefined`
 * for anything else, foreign path included.
 *
 * This is how a host's registered source is told apart from a request for a
 * different version of aidd's own shared build without opening anything: the fact
 * lives in the path's own segments, decided structurally, never guessed from a
 * catalog's declared name or plugin set.
 */
export function parseUserBuiltMarketplaceDir(
  userConfigDir: string,
  path: string,
  platform: string = process.platform
): UserBuiltMarketplaceLocation | undefined {
  const segments = segmentsUnder(join(userConfigDir, "cache", "built"), path, platform);
  if (segments === undefined || segments.length !== 3) return undefined;
  const [version, marketplaceName, target] = segments;
  return { version, marketplaceName, target };
}

/** What `builtMarketplaceDir` encoded into a path, read back. */
export interface BuiltMarketplaceLocation {
  readonly marketplaceName: string;
  readonly target: string;
}

/**
 * The inverse of `builtMarketplaceDir`, mirroring `parseUserBuiltMarketplaceDir` for
 * the project-scope shape — decidable the same way, from the path's own segments.
 */
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

/** The path segments of `path` past `base`, or `undefined` when `path` does not sit
 * under `base` at all — the shared string mechanics behind both parsers above, so
 * the separator-normalisation rule lives in one place, the same as
 * `pathContainsOrEquals`. Compares spelling (folded by `platform` for the containment
 * test only — the segments returned keep their original casing); does not resolve
 * either side. A trailing separator on `base` is tolerated: a real directory string
 * carrying one is not a corrupted path. */
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

/** Whether two path segments name the same thing, folded the same way a case-insensitive
 * platform's own filesystem would: identical spelling everywhere but win32, where the
 * comparison is case-insensitive — the same rule `segmentsUnder` applies to containment,
 * named here for a caller comparing an already-extracted segment (a marketplace name, a
 * build target) rather than a whole path. `platform` is passed explicitly, never read
 * from `process.platform` directly, so a test can exercise the win32 branch on any OS —
 * the same testable shape `mcp-exclusion.ts`'s `transformFor` already uses. */
export function samePathSegment(
  a: string,
  b: string,
  platform: string = process.platform
): boolean {
  return platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
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

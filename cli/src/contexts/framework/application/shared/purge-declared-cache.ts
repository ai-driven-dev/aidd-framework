import { join } from "node:path";
import { describeError } from "../../../../kernel/describe-error.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import { isStrictlyWithinUserScope } from "../../domain/plugins/user-scope-containment.js";

/**
 * The one containment whitelist every purge of a host's own declared cache shares:
 * `clean`'s marketplace-level purge (`CleanUseCase.purgeOneMarketplaceCache`) and
 * `plugin remove`'s own plugin-level purge (`PluginRemoveUseCase.removeCachedPlugin`)
 * both call this before either decides *when* it is safe to delete, so the containment
 * check has one home instead of two copies drifting apart.
 *
 * Returns `<cacheRoot>/<relativeSegments>` once its real, `realpath`-resolved location
 * is proven to sit strictly inside `cacheRoot` — never on the manifest's word alone,
 * since `relativeSegments` (a `hostName`, or `hostName/pluginName`) is data a corrupted
 * entry could carry a `..` segment in, or a path a symlink could have escaped through
 * after install. `null` for a `cacheRoot` or candidate that does not exist (silent — a
 * cache path `clean` cannot even find is nothing to purge) or a `realpath` call that
 * failed for any other reason (EACCES, ELOOP… — named and kept, never left to abort
 * whatever else the caller still has to do), or one that resolves outside `cacheRoot`
 * (named and kept).
 */
export async function resolveCacheCandidate(
  fs: FileReader,
  logger: Logger,
  cacheRoot: string,
  relativeSegments: string,
  label: string
): Promise<string | null> {
  const candidate = join(cacheRoot, relativeSegments);
  let resolvedBoundary: string | null;
  let resolvedCandidate: string | null;
  try {
    resolvedBoundary = await tryRealpath(fs, cacheRoot);
    if (resolvedBoundary === null) return null;
    resolvedCandidate = await tryRealpath(fs, candidate);
  } catch (error) {
    logger.warn(
      `${label} could not be resolved, ${candidate}: ${describeError(error)}; left in place.`
    );
    return null;
  }
  if (resolvedCandidate === null) return null;
  if (!isStrictlyWithinUserScope(resolvedCandidate, resolvedBoundary)) {
    logger.warn(`${label} does not resolve inside ${cacheRoot}; left in place: ${candidate}`);
    return null;
  }
  return candidate;
}

/**
 * Deletes an already-`resolveCacheCandidate`d path once two proofs both hold, neither
 * one alone: `confirmed` — the host's own CLI actually reported success removing
 * whatever this path names, never assumed from the manifest's word — and, only then,
 * the directory itself proven empty, recursively, the one fact this function can read
 * back without a registry to reread. Either missing keeps the path in place and names
 * why. A directory that no longer exists is nothing to purge either, silently.
 */
export async function purgeCacheIfEmptyAndConfirmed(
  fs: FileReader & FileWriter,
  logger: Logger,
  candidate: string,
  confirmed: boolean,
  label: string
): Promise<void> {
  if (!confirmed) {
    logger.warn(`${label} left in place, its own removal was not confirmed: ${candidate}`);
    return;
  }
  let entries: string[];
  try {
    entries = await fs.listDirectory(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (entries.length > 0) {
    logger.warn(`${label} left in place, it still holds ${entries.length} file(s): ${candidate}`);
    return;
  }
  await fs.deleteDirectory(candidate);
  logger.info(`${label} purged: ${candidate}`);
}

async function tryRealpath(fs: FileReader, path: string): Promise<string | null> {
  try {
    return await fs.realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

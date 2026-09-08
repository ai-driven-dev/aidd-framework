import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import { type AiToolId, isAiToolId, type ToolId } from "../../../../kernel/tool.js";
import type { HostMarketplaceRegistryReader } from "../../../tools/domain/ports/host-marketplace-registry-reader.js";
import { nativeActivationOf } from "../../../tools/domain/registry.js";
import type { NativeRegistrations } from "../../domain/manifest/native-registrations.js";
import { purgeCacheIfEmptyAndConfirmed, resolveCacheCandidate } from "./purge-declared-cache.js";

/** What one tool's own native-undo pass learned, the shape both `CleanUseCase` (its
 * own `UndoneRegistration`) and `CleanUserScopeUseCase` produce — structurally, not by
 * sharing one named type, since each records it for a different reason (project scope
 * threads a `sharedSourceOutcome` through its own version too). */
export interface UndoneToolRegistrations {
  readonly registrations: NativeRegistrations;
  readonly removedHostNames: ReadonlySet<string>;
}

/** For every tool a native-undo pass actually drove — never one whose binary was
 * absent, `undone` holds only the tools it ran for — purges the cache its profile
 * declares, one marketplace at a time. A tool whose profile declares no
 * `NativeActivation.pluginCacheDir` is not looked at: neither caller invents a cache
 * path for a tool that never named one. */
export async function purgeAllNativeCaches(
  fs: FileReader & FileWriter,
  logger: Logger,
  home: string,
  hostMarketplaceRegistries: ReadonlyMap<AiToolId, HostMarketplaceRegistryReader>,
  undone: ReadonlyMap<ToolId, UndoneToolRegistrations>
): Promise<void> {
  for (const [toolId, { registrations, removedHostNames }] of undone) {
    if (!isAiToolId(toolId)) continue;
    const cacheRoot = nativeActivationOf(toolId)?.pluginCacheDir?.(home);
    if (cacheRoot === undefined) continue;
    for (const { hostName } of registrations.marketplaces) {
      await purgeNativeMarketplaceCache(
        fs,
        logger,
        hostMarketplaceRegistries.get(toolId),
        cacheRoot,
        registrations.binary,
        hostName,
        removedHostNames.has(hostName)
      );
    }
  }
}

/**
 * Purges one marketplace's own cache directory under a host's declared `cacheRoot` —
 * shared by `CleanUseCase` (project scope, one project's own claim dropped first) and
 * `CleanUserScopeUseCase` (machine scope, the whole shared registration undone), the
 * two callers that both drive a host's own CLI to forget a marketplace and then need
 * the exact same two proofs before touching what it left behind:
 *
 * `~/.claude/plugins/cache/<hostName>/` and its like are indexed by a name that is
 * global to the machine, not to whichever caller is running — a name this purge just
 * watched its own undo ask the host to forget, but that another project (or, for the
 * machine-scope caller, another CLI version) could still hold. Containment alone
 * (`resolveCacheCandidate`'s own `realpath` check) proves the path cannot escape the
 * declared cache root; it does not prove the caller still owns what sits inside it.
 * Two ways to prove that, one per declaration:
 *
 * - a profile declaring `marketplaceRegistry` (claude) is reread after the undo above:
 *   the name gone from that registry is the host's own admission nothing there
 *   resolves any more, and only then is the tree removed, in full;
 * - a profile declaring `pluginCacheDir` alone, no `marketplaceRegistry` (codex),
 *   drives a host that already deletes a marketplace's cached content on its own
 *   `plugin remove` — measured, it leaves only the now-empty directory shell behind.
 *   Its own emptiness is *one* of the two proofs there, cheaper than a registry this
 *   host offers no way to reread — but emptiness alone proves no data would be lost,
 *   never that the caller is the one who emptied it. The other proof is `removed`:
 *   whether the host's own `removeMarketplace` call itself confirmed it actually
 *   forgot this `hostName`. Both are required.
 *
 * Either way, a path that fails containment, a registry that still names the tenant,
 * or a removal never confirmed is left in place and named — never removed on a
 * manifest's or a registry's word alone.
 */
export async function purgeNativeMarketplaceCache(
  fs: FileReader & FileWriter,
  logger: Logger,
  reader: HostMarketplaceRegistryReader | undefined,
  cacheRoot: string,
  binary: string,
  hostName: string,
  removed: boolean
): Promise<void> {
  const candidate = await resolveCacheCandidate(
    fs,
    logger,
    cacheRoot,
    hostName,
    `${binary}: cache path for '${hostName}'`
  );
  if (candidate === null) return;
  if (reader === undefined) {
    await purgeCacheIfEmptyAndConfirmed(
      fs,
      logger,
      candidate,
      removed,
      `${binary}: cache for '${hostName}'`
    );
    return;
  }
  await purgeOnceRegistryClears(fs, logger, reader, candidate, binary, hostName);
}

/**
 * Fail-closed: a purge happens on exactly two answers — the registry never existed
 * (`absent`, nothing was ever named there) or it exists and no longer names this
 * `hostName`. Anything else — still naming it, or the registry itself could not be
 * read or parsed (`unreadable`) — keeps the cache and names why, never guessing a
 * purge is safe from a reading this reader will not vouch for.
 */
async function purgeOnceRegistryClears(
  fs: FileReader & FileWriter,
  logger: Logger,
  reader: HostMarketplaceRegistryReader,
  candidate: string,
  binary: string,
  hostName: string
): Promise<void> {
  const reading = await reader.read();
  if (reading.absent === true) {
    await purgeCache(fs, logger, candidate, binary, hostName);
    return;
  }
  if (reading.entries !== undefined) {
    if (reading.entries.has(hostName)) {
      logger.warn(
        `${binary}: cache for '${hostName}' left in place, ${reading.location} still names it: ${candidate}`
      );
      return;
    }
    await purgeCache(fs, logger, candidate, binary, hostName);
    return;
  }
  logger.warn(
    `${binary}: plugin cache left in place, its registry could not be read: ${reading.location}`
  );
}

/** The one place either caller actually deletes a cache directory, so the `--force`
 * line announcing it is printed from exactly one call site. */
async function purgeCache(
  fs: FileReader & FileWriter,
  logger: Logger,
  candidate: string,
  binary: string,
  hostName: string
): Promise<void> {
  await fs.deleteDirectory(candidate);
  logger.info(`${binary}: cache for '${hostName}' purged: ${candidate}`);
}

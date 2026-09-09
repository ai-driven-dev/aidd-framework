import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import { type AiToolId, isAiToolId, type ToolId } from "../../../../kernel/tool.js";
import type { HostMarketplaceRegistryReader } from "../../../tools/domain/ports/host-marketplace-registry-reader.js";
import { nativeActivationOf } from "../../../tools/domain/registry.js";
import type { NativeRegistrations } from "../../domain/manifest/native-registrations.js";
import { purgeCacheIfEmptyAndConfirmed, resolveCacheCandidate } from "./purge-declared-cache.js";

export interface UndoneToolRegistrations {
  readonly registrations: NativeRegistrations;
  readonly removedHostNames: ReadonlySet<string>;
}

/** Never a tool whose binary was absent — `undone` holds only the tools a pass ran for. A tool
 * whose profile declares no `NativeActivation.pluginCacheDir` is not looked at: no cache path is
 * invented for a tool that never named one. */
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
 * A host's cache directory is indexed by a name global to the machine, not to whichever caller is
 * running, so containment alone proves the path cannot escape the declared root — never that the
 * caller still owns what sits inside it. Two proofs, one per declaration:
 *
 * - a profile declaring `marketplaceRegistry` (claude) is reread after the undo: the name gone
 *   from that registry is the host's own admission nothing there resolves any more;
 * - a profile declaring `pluginCacheDir` alone (codex) drives a host that deletes the cached
 *   content itself and leaves only an empty shell — measured. Emptiness proves no data would be
 *   lost, never that this caller emptied it, so `removed` (the host's own confirmation) is
 *   required alongside it.
 *
 * A path failing containment, a registry still naming the tenant, or a removal never confirmed is
 * left in place and named.
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
 * Fail-closed: a purge happens on exactly two answers — the registry never existed, or it exists
 * and no longer names this `hostName`. Anything else, `unreadable` included, keeps the cache and
 * names why.
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

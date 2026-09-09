import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { AiToolId } from "../../../../kernel/tool.js";
import {
  type MarketplaceCatalogIdentity,
  type MarketplaceSourceConflict,
  marketplaceSourceConflict,
} from "../../../tools/domain/marketplace-source-conflict.js";
import type { HostMarketplaceRegistryReader } from "../../../tools/domain/ports/host-marketplace-registry-reader.js";
import {
  type MarketplaceSourceDrift,
  type MarketplaceSourceDriftContext,
  marketplaceSourceDrift,
} from "../../domain/marketplace-source-drift.js";
import { readMarketplaceCatalogIdentity } from "./read-marketplace-catalog-identity.js";

/**
 * A version or migration drift decided from the path's own segments — never a different-catalog
 * conflict, so it carries no identity at all.
 */
export interface MarketplaceSourceDriftFound {
  readonly name: string;
  readonly registeredSource: string;
  readonly requestedSource: string;
  readonly location: string;
  readonly drift: MarketplaceSourceDrift;
}

export type HostMarketplaceSourceCheck =
  | MarketplaceSourceConflict
  | MarketplaceSourceDriftFound
  | undefined;

/** `drift` is the one field `MarketplaceSourceConflict` does not have, so its presence alone
 * discriminates. */
export function isDriftFound(
  check: HostMarketplaceSourceCheck
): check is MarketplaceSourceDriftFound {
  return check !== undefined && "drift" in check;
}

/** `fs.realpath`, falling back to the path itself when it cannot resolve: a dead registration must
 * not cost every other comparison its answer. */
async function resolvedOrSelf(fs: FileReader, path: string): Promise<string> {
  return fs.realpath(path).catch(() => path);
}

/**
 * Asks a host's own marketplace registry whether registering `requestedSource` would silently
 * replace a different catalog, or repeat a version/migration drift this project's build
 * recognises. Always keyed by `requestedIdentity.name`, never a caller's own local alias, which
 * the host's registry was never asked about — folding both reads here is what keeps two callers
 * from keying them differently.
 *
 * Reads the registry fresh on every call, so a caller iterating several marketplaces asks once per
 * marketplace. Every path is resolved through `fs.realpath` before the drift decision compares
 * them: the drift parsers compare spelling, not identity, so a `userConfigDir()` reached through a
 * symlink (`/var` → `/private/var` on macOS) would fail every containment check silently.
 */
export async function hostMarketplaceSourceConflict(
  fs: FileReader,
  toolId: AiToolId,
  reader: HostMarketplaceRegistryReader,
  requestedSource: string,
  requestedIdentity: MarketplaceCatalogIdentity,
  /** Present only for a caller that wants the version/migration drift decided before falling back
   * to the catalog-identity check — computed for every `aidd-framework` entry regardless of its
   * own `scope`, since an unmigrated project-scope registration is exactly what it decides. */
  driftContext?: MarketplaceSourceDriftContext
): Promise<HostMarketplaceSourceCheck> {
  const reading = await reader.read();
  const registeredSource = reading.entries?.get(requestedIdentity.name);
  if (registeredSource === undefined) return undefined;
  if (driftContext !== undefined) {
    const drift = await resolvedDrift(fs, registeredSource, requestedSource, driftContext);
    if (drift !== undefined) {
      return {
        name: requestedIdentity.name,
        registeredSource,
        requestedSource,
        location: reading.location,
        drift,
      };
    }
  }
  const registeredIdentity = await readMarketplaceCatalogIdentity(fs, toolId, registeredSource);
  return marketplaceSourceConflict(
    reading,
    requestedIdentity.name,
    requestedSource,
    registeredIdentity,
    requestedIdentity
  );
}

async function resolvedDrift(
  fs: FileReader,
  registeredSource: string,
  requestedSource: string,
  context: MarketplaceSourceDriftContext
): Promise<MarketplaceSourceDrift | undefined> {
  const [resolvedRegistered, resolvedRequested, resolvedUserCacheRoot, resolvedProjectRoot] =
    await Promise.all([
      resolvedOrSelf(fs, registeredSource),
      resolvedOrSelf(fs, requestedSource),
      resolvedOrSelf(fs, context.userCacheRoot),
      resolvedOrSelf(fs, context.projectRoot),
    ]);
  return marketplaceSourceDrift(resolvedRegistered, resolvedRequested, {
    ...context,
    userCacheRoot: resolvedUserCacheRoot,
    projectRoot: resolvedProjectRoot,
  });
}

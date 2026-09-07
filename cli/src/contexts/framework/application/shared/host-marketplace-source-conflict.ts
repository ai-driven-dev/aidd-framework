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
 * A version or migration drift decided from the path's own segments — never a
 * different-catalog conflict, so it carries no identity at all. Kept a distinct shape
 * from {@link MarketplaceSourceConflict} rather than an optional field on it: the two
 * used to share one type with `drift` optional, which forced `registeredIdentity` and
 * `requestedIdentity` optional too, and two callers each carried an `if` branch for a
 * shape neither ever actually produced.
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

/** Narrows a {@link HostMarketplaceSourceCheck} to the drift shape — the one field
 * `MarketplaceSourceConflict` no longer has, so its presence alone discriminates. */
export function isDriftFound(
  check: HostMarketplaceSourceCheck
): check is MarketplaceSourceDriftFound {
  return check !== undefined && "drift" in check;
}

/** `fs.realpath`, falling back to the path itself when it cannot resolve — a dead
 * registration (most often a directory that no longer exists) must not cost every
 * other comparison its answer, the same fallback the real host-registry reader
 * already applies to its own entries. */
async function resolvedOrSelf(fs: FileReader, path: string): Promise<string> {
  return fs.realpath(path).catch(() => path);
}

/**
 * Asks a host's own marketplace registry whether registering `requestedSource` under
 * `requestedIdentity`'s own declared name would silently replace a different catalog,
 * or would repeat a version/migration drift this project's own build recognises —
 * the one read either fact needs, shared by `MarketplaceSyncSettingsUseCase` (sync
 * time) and `DoctorRegistrationUseCase` (doctor time) so neither can key its own
 * lookup by anything but the catalog's own declared name.
 *
 * Always keyed by `requestedIdentity.name` — never a caller's own local alias for the
 * marketplace, which the host's registry was never asked about in the first place.
 * Reading `reading.entries` and then reading the registered catalog it names used to
 * happen twice, once in each caller, and a caller free to pass a different key to each
 * read is exactly how the two could disagree; folding both reads into this one function
 * makes that disagreement impossible to write, not merely a rule to remember.
 *
 * Reads the registry fresh on every call, deliberately: a caller iterating several
 * marketplaces asks this once per marketplace, the same cadence `MarketplaceSyncSettingsUseCase`
 * already had (see `activateTool`'s own loop) — `DoctorRegistrationUseCase` used to read once
 * per tool and reuse it across every marketplace in that tool's loop, which is the one
 * fact these two passes had never agreed on.
 *
 * `registeredSource`, `requestedSource`, `userCacheRoot` and `projectRoot` are all
 * resolved through the same `fs.realpath` before the drift decision ever compares
 * them: a `userConfigDir()` reached through a symlink (`/var` → `/private/var` on
 * macOS) otherwise fails every containment check silently, since the drift parsers
 * compare spelling, not identity.
 */
export async function hostMarketplaceSourceConflict(
  fs: FileReader,
  toolId: AiToolId,
  reader: HostMarketplaceRegistryReader,
  requestedSource: string,
  requestedIdentity: MarketplaceCatalogIdentity,
  /** Present only for a caller that wants the version/migration drift decided
   * before falling back to the catalog-identity check — computed for every
   * `aidd-framework` entry regardless of its own `scope`, since an unmigrated
   * project-scope registration is exactly the state this decides. */
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

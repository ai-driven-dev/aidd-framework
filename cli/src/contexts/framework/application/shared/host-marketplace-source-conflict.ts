import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { AiToolId } from "../../../../kernel/tool.js";
import {
  type MarketplaceCatalogIdentity,
  type MarketplaceSourceConflict,
  marketplaceSourceConflict,
} from "../../../tools/domain/marketplace-source-conflict.js";
import type { HostMarketplaceRegistryReader } from "../../../tools/domain/ports/host-marketplace-registry-reader.js";
import { readMarketplaceCatalogIdentity } from "./read-marketplace-catalog-identity.js";

/**
 * Asks a host's own marketplace registry whether registering `requestedSource` under
 * `requestedIdentity`'s own declared name would silently replace a different catalog —
 * the one read this fact needs, shared by `MarketplaceSyncSettingsUseCase` (sync time)
 * and `DoctorRegistrationUseCase` (doctor time) so neither can key its own lookup by
 * anything but the catalog's own declared name.
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
 */
export async function hostMarketplaceSourceConflict(
  fs: FileReader,
  toolId: AiToolId,
  reader: HostMarketplaceRegistryReader,
  requestedSource: string,
  requestedIdentity: MarketplaceCatalogIdentity
): Promise<MarketplaceSourceConflict | undefined> {
  const reading = await reader.read();
  const registeredSource = reading.entries?.get(requestedIdentity.name);
  const registeredIdentity =
    registeredSource === undefined
      ? undefined
      : await readMarketplaceCatalogIdentity(fs, toolId, registeredSource);
  return marketplaceSourceConflict(
    reading,
    requestedIdentity.name,
    requestedSource,
    registeredIdentity,
    requestedIdentity
  );
}

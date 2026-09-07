import { join } from "node:path";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import { isAiToolId, type ToolId } from "../../../../kernel/tool.js";
import type { MarketplaceCatalogIdentity } from "../../../tools/domain/marketplace-source-conflict.js";
import { getAiToolConfig } from "../../../tools/domain/registry.js";

/**
 * What a directory's own catalog declares about itself — `name` and the plugin
 * names its `plugins` array carries, never `version` (see `MarketplaceCatalogIdentity`'s
 * own doc for why) — read from the same relative file a tool's own
 * `distributionProbes.marketplace` names, so this agrees with whatever that tool
 * would actually read there. `undefined` when the directory carries no readable
 * catalog at that path, or the JSON found there names nothing: silence, not a fact
 * to invent, which is what lets a dead registry entry or an unbuilt tree answer "no
 * fact" instead of a false "different catalog".
 *
 * Shared by `MarketplaceSyncSettingsUseCase` (`flows/`) and `DoctorRegistrationUseCase`
 * (`doctor/`) — both need the identical read, one at sync time, one at doctor time,
 * over the same two directories: this project's own built tree, and wherever a host's
 * registry currently resolves the same name to.
 */
export async function readMarketplaceCatalogIdentity(
  fs: FileReader,
  toolId: ToolId,
  dir: string
): Promise<MarketplaceCatalogIdentity | undefined> {
  const path = marketplaceCatalogProbePath(toolId, dir);
  if (path === undefined) return undefined;
  const content = await fs.readFile(path).catch(() => undefined);
  if (content === undefined) return undefined;
  try {
    const parsed = JSON.parse(content) as { name?: unknown; plugins?: unknown };
    if (typeof parsed.name !== "string") return undefined;
    const pluginNames = Array.isArray(parsed.plugins) ? pluginNamesOf(parsed.plugins) : [];
    return { name: parsed.name, pluginNames };
  } catch {
    return undefined;
  }
}

/** The exact path {@link readMarketplaceCatalogIdentity} reads, named so a caller whose
 * read came back `undefined` can report *which file* it found nothing readable at,
 * rather than only that the read failed. `undefined` for the same reason the read
 * itself would answer nothing: not an AI tool, or one whose profile declares no
 * `distributionProbes.marketplace` at all. */
export function marketplaceCatalogProbePath(toolId: ToolId, dir: string): string | undefined {
  if (!isAiToolId(toolId)) return undefined;
  const catalogRelative = getAiToolConfig(toolId).distributionProbes?.marketplace?.[0];
  return catalogRelative === undefined ? undefined : join(dir, catalogRelative);
}

function pluginNamesOf(plugins: readonly unknown[]): string[] {
  const names: string[] = [];
  for (const plugin of plugins) {
    if (plugin === null || typeof plugin !== "object") continue;
    const name = (plugin as { name?: unknown }).name;
    if (typeof name === "string") names.push(name);
  }
  return names;
}

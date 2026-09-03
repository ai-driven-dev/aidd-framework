import type { MarketplaceSettingsEntry, MarketplaceSettingsInput } from "./plugins-capability.js";

/** `{ source: { source: "github"|"directory", repo/path: "..." }, version? }` — the entry
 * shape every tool accepts unless it declares its own. */
export function buildDefaultMarketplaceEntry(
  input: MarketplaceSettingsInput
): MarketplaceSettingsEntry | null {
  const { name, source, version } = input;
  const value: Record<string, unknown> = {};

  if (source.kind === "local") {
    value.source = { source: "directory", path: source.path };
  } else if (source.kind === "github") {
    value.source = { source: "github", repo: source.repo };
  } else {
    return null;
  }

  if (version != null) value.version = version;
  return { valueShape: "map", key: name, value };
}

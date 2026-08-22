import type { PluginSource } from "../models/plugin-source.js";

export interface MarketplaceSettingsEntryMap {
  valueShape: "map";
  key: string;
  value: Record<string, unknown>;
}

export interface MarketplaceSettingsEntryArray {
  valueShape: "array";
  value: string;
}

export type MarketplaceSettingsEntry = MarketplaceSettingsEntryMap | MarketplaceSettingsEntryArray;

export interface MarketplaceSettingsInput {
  name: string;
  source: PluginSource;
  version?: string;
}

/**
 * Describes where and how a tool records the marketplaces it knows about, for the
 * tools whose settings file this CLI writes itself. Kept apart from
 * {@link PluginsCapability} because the two answer different questions: this one is
 * read only by marketplace settings synchronisation, that one by every tool profile.
 */
export interface MarketplaceSettings {
  settingsPath: string;
  settingsKey: string;
  valueShape?: "map" | "array";
  enabledPluginsKey?: string;
  enabledPluginsSettingsPath?: string;
  /**
   * Where the registered marketplaces go. They name a built marketplace by absolute
   * path, so they describe one machine and one operating system, which decides the
   * three answers a tool can give:
   *
   * - `undefined` — into `settingsPath`, alongside the rest. Only sound for a tool
   *   whose settings file is not meant to be shared.
   * - a path — into a file of its own, which the tool reads but this CLI neither
   *   commits nor hashes. The sibling keys hold names rather than paths, so they stay
   *   in `settingsPath` where a team can share them.
   * - `null` — nowhere. The tool offers no machine-local project file, and its shared
   *   one is explicitly for recommending plugins to teammates, where a path belonging
   *   to whoever ran the install is worse than nothing.
   */
  marketplacesSettingsPath?: string | null;
  toEntry(input: MarketplaceSettingsInput): MarketplaceSettingsEntry | null;
}

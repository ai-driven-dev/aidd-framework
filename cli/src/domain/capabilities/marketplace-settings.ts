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
   * Where the registered marketplaces go, when that is not `settingsPath`.
   *
   * The entries name a built marketplace by absolute path, so they describe one
   * machine and cannot be committed. Declaring this sends them to a file the tool
   * still reads but the CLI neither commits nor hashes — the sibling keys, which hold
   * names rather than paths, stay in `settingsPath` where a team can share them.
   */
  marketplacesSettingsPath?: string;
  toEntry(input: MarketplaceSettingsInput): MarketplaceSettingsEntry | null;
}

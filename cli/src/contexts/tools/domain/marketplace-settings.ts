import type { PluginSource } from "../../../kernel/source.js";

export interface MarketplaceSettingsInput {
  name: string;
  source: PluginSource;
}

/** Where and how a tool records the marketplaces it knows about, for the tools whose settings
 * file this CLI writes itself. Kept apart from {@link PluginsCapability} because the two answer
 * different questions: this one is read only by marketplace settings synchronisation. */
export interface MarketplaceSettings {
  settingsPath: string;
  settingsKey: string;
  enabledPluginsKey?: string;
  /**
   * Where the tool keeps its registered marketplaces, for `doctor`, which checks the tool
   * actually wrote one. A path names a file of its own, which this CLI neither commits nor
   * hashes since its entries name built trees by absolute path; `null` means nowhere — the tool
   * offers no machine-local project file, and its shared one is for recommending plugins to
   * teammates, where a path belonging to whoever ran the install is worse than nothing.
   */
  marketplacesSettingsPath: string | null;
  /** The name this marketplace is keyed by in the enabled-plugins map, or `null` when the tool
   * cannot express its source and no key should be written. */
  toEntryKey(input: MarketplaceSettingsInput): string | null;
}

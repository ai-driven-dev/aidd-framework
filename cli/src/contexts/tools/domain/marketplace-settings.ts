import type { PluginSource } from "../../../kernel/source.js";

/**
 * One marketplace, as the tool records it: a key in a map of entries.
 *
 * There used to be a second shape — a plain string in an array — for tools whose settings
 * held marketplaces that way. No profile ever produced one, and the code that consumed it
 * was the registration this CLI wrote itself, which every plugin-capable tool now does
 * through its own command instead. Both are gone.
 */
export interface MarketplaceSettingsEntry {
  key: string;
  value: Record<string, unknown>;
}

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
  enabledPluginsKey?: string;
  enabledPluginsSettingsPath?: string;
  /**
   * Where the tool keeps its registered marketplaces, for the two readers that still
   * need to know: `doctor`, which checks the tool actually wrote one, and the eviction
   * that takes a stale entry out of the shared file.
   *
   * - a path — a file of its own, which the tool writes and this CLI neither commits nor
   *   hashes: the entries name built trees by absolute path, so they describe one machine.
   * - `null` — nowhere. The tool offers no machine-local project file, and its shared one
   *   is for recommending plugins to teammates, where a path belonging to whoever ran the
   *   install is worse than nothing.
   *
   * There was a third answer, `undefined`, meaning "into `settingsPath` alongside the
   * rest". It described the era when this CLI wrote the registration itself. It no longer
   * does — the tool's own command does — so the answer had nothing left to mean.
   */
  marketplacesSettingsPath: string | null;
  toEntry(input: MarketplaceSettingsInput): MarketplaceSettingsEntry | null;
}

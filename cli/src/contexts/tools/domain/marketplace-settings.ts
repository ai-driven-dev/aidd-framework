import type { PluginSource } from "../../../kernel/source.js";

export interface MarketplaceSettingsInput {
  name: string;
  source: PluginSource;
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
  /**
   * The name this marketplace is keyed by in the enabled-plugins map, or `null` when the
   * tool cannot express its source and no key should be written.
   *
   * It used to return the whole entry — key and a value object carrying the source and the
   * catalog version — for the registration this CLI wrote itself. Every plugin-capable tool
   * now writes that through its own command, so the value had no reader left, and the
   * catalog read that filled its version ran once per marketplace per sync for nothing.
   */
  toEntryKey(input: MarketplaceSettingsInput): string | null;
}

/**
 * A marketplace layout aidd can read. This is about ingestion, not about which tools aidd
 * writes to: a tool can materialize plugin content without its vendor having any plugin
 * manager, in which case it is a target only and never appears here.
 */
export type PluginFormat = "claude" | "cursor" | "codex" | "copilot" | "opencode";

/** Runtime companion to PluginFormat, so the ingestible set can be iterated and asserted. */
export const PLUGIN_FORMATS: readonly PluginFormat[] = [
  "claude",
  "cursor",
  "codex",
  "copilot",
  "opencode",
];

export const PLUGIN_MANIFEST_PROBES: readonly { format: PluginFormat; relativePath: string }[] = [
  { format: "claude", relativePath: ".claude-plugin/plugin.json" },
  { format: "cursor", relativePath: ".cursor-plugin/plugin.json" },
  { format: "codex", relativePath: ".codex-plugin/plugin.json" },
  { format: "copilot", relativePath: ".plugin/plugin.json" },
  { format: "copilot", relativePath: ".github/plugin/plugin.json" },
  { format: "copilot", relativePath: "plugin.json" },
];

export const MARKETPLACE_PROBES: readonly { format: PluginFormat; relativePath: string }[] = [
  { format: "claude", relativePath: ".claude-plugin/marketplace.json" },
  { format: "cursor", relativePath: ".cursor-plugin/marketplace.json" },
  { format: "codex", relativePath: ".agents/plugins/marketplace.json" },
  { format: "copilot", relativePath: ".github/plugin/plugin.json" },
  { format: "opencode", relativePath: "opencode.json" },
];

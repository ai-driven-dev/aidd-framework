export type PluginFormat = "claude" | "cursor" | "codex" | "copilot" | "opencode";

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

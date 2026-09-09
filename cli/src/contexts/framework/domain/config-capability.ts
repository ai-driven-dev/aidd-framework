import { HooksCapability } from "../../tools/domain/capabilities/hooks-capability.js";
import { McpCapability } from "../../tools/domain/capabilities/mcp-capability.js";
import { SettingsCapability } from "../../tools/domain/capabilities/settings-capability.js";
import type { ToolConfig } from "../../tools/domain/registry.js";

export type ConfigCapability = McpCapability | HooksCapability | SettingsCapability;

export function extractConfigCapabilities(config: ToolConfig): ConfigCapability[] {
  const result: ConfigCapability[] = [];

  if ("settings" in config) {
    const s = (config as { settings: unknown }).settings;
    if (s instanceof SettingsCapability) result.push(s);
    else if (Array.isArray(s)) result.push(...(s as SettingsCapability[]));
  }

  if (config.kind === "ai") {
    const aiCaps = config.capabilities as Record<string, unknown>;
    if (typeof aiCaps === "object" && aiCaps !== null) {
      if (aiCaps.mcp instanceof McpCapability) result.push(aiCaps.mcp);
      if (aiCaps.hooks instanceof HooksCapability) result.push(aiCaps.hooks);
      if (aiCaps.settings instanceof SettingsCapability) result.push(aiCaps.settings);
      if (Array.isArray(aiCaps.settings)) result.push(...(aiCaps.settings as SettingsCapability[]));
    }
  }

  return result;
}

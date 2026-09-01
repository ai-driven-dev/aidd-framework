import { McpCapability } from "../../contexts/tools/domain/mcp-capability.js";
import type { ToolConfig } from "../../contexts/tools/domain/registry.js";
import { SettingsCapability } from "../../contexts/tools/domain/settings-capability.js";
import { HooksCapability } from "../capabilities/hooks-capability.js";

export type ConfigCapability = McpCapability | HooksCapability | SettingsCapability;

export function extractConfigCapabilities(config: ToolConfig): ConfigCapability[] {
  const result: ConfigCapability[] = [];

  // IDE tools expose settings directly
  if ("settings" in config) {
    const s = (config as { settings: unknown }).settings;
    if (s instanceof SettingsCapability) result.push(s);
    else if (Array.isArray(s)) result.push(...(s as SettingsCapability[]));
  }

  // AI tools expose capabilities bag
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

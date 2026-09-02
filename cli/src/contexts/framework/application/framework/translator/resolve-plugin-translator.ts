import type { PluginsCapability } from "../../../../tools/domain/plugins-capability.js";
import { isAiTool, type ToolConfig } from "../../../../tools/domain/registry.js";
import type { PluginTranslator } from "./plugin-translator.js";
import { resolveTranslator, type TranslatorDeps } from "./plugin-translator-factory.js";

/**
 * Resolves the plugin translator for a tool, or null when the tool is not an AI
 * tool or has no plugins capability. Shared guard used by every call site that
 * needs a translator before materializing plugin files.
 */
export function resolvePluginTranslator(
  toolConfig: ToolConfig,
  deps: TranslatorDeps
): PluginTranslator | null {
  if (!isAiTool(toolConfig)) return null;
  const caps = toolConfig.capabilities as Record<string, unknown>;
  if (!("plugins" in caps)) return null;
  return resolveTranslator(caps.plugins as PluginsCapability, deps);
}

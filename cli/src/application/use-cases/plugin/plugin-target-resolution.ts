import { McpCapability } from "../../../domain/capabilities/mcp-capability.js";
import type { PluginsCapability } from "../../../domain/capabilities/plugins-capability.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { AiToolId } from "../../../domain/models/tool-ids.js";
import { AI_TOOL_IDS } from "../../../domain/models/tool-ids.js";
import { getToolConfig, isAiTool } from "../../../domain/tools/registry.js";

export function resolvePluginToolIds(toolIds: AiToolId[] | "all", manifest: Manifest): AiToolId[] {
  if (toolIds !== "all") return toolIds;
  return AI_TOOL_IDS.filter((id) => manifest.hasTool(id)) as AiToolId[];
}

/** The base directory a plugin's files live under: `projectRoot` for project-scope
 * plugins, the home-relative dir `PluginsCapability` resolves for user-scope ones. */
export function resolvePluginBaseDirForCapability(
  plugins: PluginsCapability,
  projectRoot: string,
  homedir: () => string
): string {
  return plugins.resolvePluginsBaseDir(projectRoot, homedir());
}

export function resolvePluginBaseDir(
  toolId: AiToolId,
  projectRoot: string,
  homedir: () => string
): string {
  const toolConfig = getToolConfig(toolId);
  if (!isAiTool(toolConfig)) return projectRoot;
  const caps = toolConfig.capabilities as Record<string, unknown>;
  if (!("plugins" in caps)) return projectRoot;
  return resolvePluginBaseDirForCapability(caps.plugins as PluginsCapability, projectRoot, homedir);
}

export function isFrameworkPrimeFlatMcp(caps: Record<string, unknown>): boolean {
  if (!("mcp" in caps)) return false;
  const mcp = caps.mcp;
  if (!(mcp instanceof McpCapability)) return false;
  if (mcp.params.mergeStrategy !== "framework-prime") return false;
  const plugins = caps.plugins as PluginsCapability;
  return plugins.mode === "flat";
}

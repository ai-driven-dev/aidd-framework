import { UnresolvableUserScopeError } from "../../../../kernel/errors.js";
import type { AiToolId } from "../../../../kernel/tool.js";
import { AI_TOOL_IDS } from "../../../../kernel/tool.js";
import { McpCapability } from "../../../tools/domain/capabilities/mcp-capability.js";
import type { PluginsCapability } from "../../../tools/domain/capabilities/plugins-capability.js";
import { resolvePluginsCapability } from "../../../tools/domain/registry.js";
import { getToolSupportedScope } from "../../domain/install-scope.js";
import type { Manifest } from "../../domain/manifest.js";
import type { PluginScope } from "../../domain/plugins/installed-plugin.js";

export function resolvePluginToolIds(toolIds: AiToolId[] | "all", manifest: Manifest): AiToolId[] {
  if (toolIds !== "all") return toolIds;
  return AI_TOOL_IDS.filter((id) => manifest.hasTool(id)) as AiToolId[];
}

/** The scope a fresh install writes to the manifest, read once from the tool's own
 * profile — the same computation `--scope` validation already reads
 * (`getToolSupportedScope`). Nothing else calls this: every later command reads the
 * scope the manifest already recorded (`resolveBaseDirFromRecord`) instead of asking the
 * profile again, which can disagree with what was true at install time. */
export function resolveScopeForInstall(toolId: AiToolId): PluginScope {
  return getToolSupportedScope(toolId);
}

/** The base directory a plugin's `files` are relative to, from the manifest's own
 * recorded `scope` — never from the tool's current profile, which can disagree with
 * what was true when the entry was written. Throws rather than falling back to
 * `projectRoot` for a `"user"` scope the tool's profile no longer explains: a silent
 * fallback would resolve a suppression, a deletion or a drift check against the wrong
 * directory, which is exactly the guess this split exists to stop making. */
export function resolveBaseDirFromRecord(
  scope: PluginScope,
  toolId: AiToolId,
  projectRoot: string,
  homedir: () => string
): string {
  if (scope === "project") return projectRoot;
  const dir = resolvePluginsCapability(toolId)?.userPluginsBaseDir(homedir());
  if (dir === null || dir === undefined) throw new UnresolvableUserScopeError(toolId);
  return dir;
}

export function isFrameworkPrimeFlatMcp(caps: Record<string, unknown>): boolean {
  if (!("mcp" in caps)) return false;
  const mcp = caps.mcp;
  if (!(mcp instanceof McpCapability)) return false;
  if (mcp.params.mergeStrategy !== "framework-prime") return false;
  const plugins = caps.plugins as PluginsCapability;
  return plugins.mode === "flat";
}

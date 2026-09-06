import { join, relative } from "node:path";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import {
  PLUGIN_AGENT_INPUT_EXT,
  PLUGIN_HOOKS_RELATIVE,
  PLUGIN_MCP_RELATIVE,
} from "../../domain/build-target.js";

export interface PluginPresenceFlags {
  readonly hasAgents: boolean;
  /** Agent markdown files relative to the plugin's `agents/` dir (e.g. "planner.md"), sorted. */
  readonly agentsList: readonly string[];
  readonly skillsList: readonly string[];
  readonly hasHooksJson: boolean;
  readonly hasMcpJson: boolean;
}

export async function listAgentFiles(
  fs: FileReader,
  agentsDir: string
): Promise<readonly string[]> {
  if (!(await fs.fileExists(agentsDir))) return [];
  const files = await fs.listFilesRecursive(agentsDir);
  return files
    .filter((f) => f.endsWith(PLUGIN_AGENT_INPUT_EXT))
    .map((f) => relative(agentsDir, f).replace(/\\/g, "/"))
    .sort();
}

export async function listSkillNames(
  fs: FileReader,
  pluginSrc: string
): Promise<readonly string[]> {
  const skillsDir = join(pluginSrc, "skills");
  if (!(await fs.fileExists(skillsDir))) return [];
  const files = await fs.listFilesRecursive(skillsDir);
  const names = new Set<string>();
  for (const f of files) {
    if (!f.endsWith("/SKILL.md") && !f.endsWith("\\SKILL.md") && !f.endsWith("SKILL.md")) {
      continue;
    }
    const rel = relative(skillsDir, f);
    const parts = rel.replace(/\\/g, "/").split("/");
    if (parts.length >= 2) names.add(parts[0]);
  }
  return [...names].sort();
}

export async function detectPluginPresenceFlags(
  fs: FileReader,
  pluginSrc: string
): Promise<PluginPresenceFlags> {
  const agentsDir = join(pluginSrc, "agents");
  const agentsList = await listAgentFiles(fs, agentsDir);
  const skillsList = await listSkillNames(fs, pluginSrc);
  const hasHooksJson = await fs.fileExists(join(pluginSrc, PLUGIN_HOOKS_RELATIVE));
  const hasMcpJson = await fs.fileExists(join(pluginSrc, PLUGIN_MCP_RELATIVE));
  return { hasAgents: agentsList.length > 0, agentsList, skillsList, hasHooksJson, hasMcpJson };
}

import { basename, join, relative } from "node:path";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import { rewriteRelativeLinks } from "../../../../kernel/relative-link-rewrite.js";
import {
  PLUGIN_AGENT_INPUT_EXT,
  PLUGIN_HOOKS_RELATIVE,
  PLUGIN_MCP_RELATIVE,
  PLUGIN_SKILL_ENTRY_FILE,
} from "../../domain/build-target.js";
import { assertNoToolsPlaceholder } from "../shared-plugin-helpers.js";

type SkillContentTransform = (content: string, plugin: string, basename: string) => string;
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
    if (
      !f.endsWith(`/${PLUGIN_SKILL_ENTRY_FILE}`) &&
      !f.endsWith(`\\${PLUGIN_SKILL_ENTRY_FILE}`) &&
      !f.endsWith(PLUGIN_SKILL_ENTRY_FILE)
    ) {
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

export async function writeSkillTree(
  fs: FileReader & FileWriter,
  pluginName: string,
  pluginSrc: string,
  pluginOut: string,
  transform?: SkillContentTransform
): Promise<number> {
  const skillsSrc = join(pluginSrc, "skills");
  if (!(await fs.fileExists(skillsSrc))) return 0;
  const files = await fs.listFilesRecursive(skillsSrc);
  let count = 0;
  for (const absPath of files) {
    count += await writeSkillFile(fs, pluginName, absPath, skillsSrc, pluginOut, transform);
  }
  return count;
}

async function writeSkillFile(
  fs: FileReader & FileWriter,
  pluginName: string,
  absPath: string,
  skillsSrc: string,
  pluginOut: string,
  transform?: SkillContentTransform
): Promise<number> {
  const relPath = relative(skillsSrc, absPath).replace(/\\/g, "/");
  const destPath = join(pluginOut, "skills", relPath);
  const content = await fs.readFile(absPath);
  if (!absPath.endsWith(".md")) {
    await fs.writeFile(destPath, content);
    return 1;
  }

  assertNoToolsPlaceholder(content, pluginName, relPath);
  const rewritten = rewriteRelativeLinks(content, {
    currentFilePluginRelative: `skills/${relPath}`,
  });
  let output = rewritten;
  if (transform && basename(absPath) === PLUGIN_SKILL_ENTRY_FILE) {
    output = transform(rewritten, pluginName, PLUGIN_SKILL_ENTRY_FILE);
  }
  await fs.writeFile(destPath, output);
  return 1;
}

import { join } from "node:path";
import {
  CategoryMismatchError,
  UnknownToolCategoryError,
  UnregisteredToolError,
} from "../errors.js";
import {
  AI_TOOL_IDS,
  type AiToolId,
  IDE_TOOL_IDS,
  type IdeToolId,
  isAiToolId,
  type ToolCategory,
  type ToolId,
  VALID_TOOL_IDS,
} from "../models/tool-ids.js";
import type { FileReader } from "../ports/file-reader.js";
import type { AiTool, IdeToolConfig } from "./contracts.js";

export type { AiToolId, IdeToolId, ToolCategory, ToolId };
export { AI_TOOL_IDS, IDE_TOOL_IDS, isAiToolId, VALID_TOOL_IDS };

export type ToolConfig = AiTool<unknown> | IdeToolConfig;

export function isAiTool(config: ToolConfig): config is AiTool<unknown> {
  return config.kind === "ai";
}

export function toolIdsForCategory(category: ToolCategory): readonly ToolId[] {
  switch (category) {
    case "ai":
      return AI_TOOL_IDS;
    case "ide":
      return IDE_TOOL_IDS;
    default: {
      const _exhaustive: never = category;
      throw new UnknownToolCategoryError(String(_exhaustive));
    }
  }
}

export function isIdeToolId(id: string): id is IdeToolId {
  return (IDE_TOOL_IDS as readonly string[]).includes(id);
}

export function assertToolIdsMatchCategory(toolIds: ToolId[], category: ToolCategory): void {
  const allowed = toolIdsForCategory(category);
  const wrong = toolIds.filter((id) => !(allowed as readonly string[]).includes(id));
  if (wrong.length === 0) return;
  throw new CategoryMismatchError(wrong, category, allowed);
}

const TOOL_REGISTRY = new Map<ToolId, ToolConfig>();

export function registerTool(config: ToolConfig): void {
  TOOL_REGISTRY.set(config.toolId, config);
}

export function getToolConfig(toolId: ToolId): ToolConfig {
  const config = TOOL_REGISTRY.get(toolId);
  if (!config) throw new UnregisteredToolError(toolId);
  return config;
}

export function getAiToolConfig(toolId: AiToolId): AiTool<unknown> {
  const config = getToolConfig(toolId);
  if (!isAiTool(config)) throw new UnregisteredToolError(toolId);
  return config;
}

/** The `AiToolId` whose declaration claims a journal host, or `null` for a host no
 * registered tool claims. The only place the journal hook's host names and this codebase's
 * tool ids are related, and it relates them by reading declarations rather than by holding
 * a table that a fifth host would have to be remembered into. */
export function journalHostToAiToolId(journalHost: string): AiToolId | null {
  for (const toolId of AI_TOOL_IDS) {
    if (getAiToolConfig(toolId).telemetryJournalHost === journalHost) return toolId;
  }
  return null;
}

export function getAllRegisteredTools(): Map<ToolId, ToolConfig> {
  return new Map(TOOL_REGISTRY);
}

export async function hasToolSignals(
  fs: FileReader,
  config: ToolConfig,
  projectRoot: string
): Promise<string[]> {
  if (!config.signalDir) return [];
  const dir = join(projectRoot, config.signalDir);
  if (!(await fs.fileExists(dir))) return [];
  const files = await fs.listDirectory(dir);
  const matches: string[] = [];
  for (const filePath of files) {
    if (!filePath.endsWith(".md")) continue;
    const content = await fs.readFile(join(dir, filePath));
    if (/^name:\s*['"]?aidd[_:]/m.test(content)) matches.push(join(config.signalDir, filePath));
  }
  return matches;
}

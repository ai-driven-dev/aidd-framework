import { join } from "node:path";
import type {
  NativeActivation,
  PluginsMode,
} from "../../../domain/capabilities/plugins-capability.js";
import type { FrameworkBuildMode } from "../../../domain/models/framework-build.js";
import {
  CategoryMismatchError,
  UnknownToolCategoryError,
  UnregisteredToolError,
} from "../../../kernel/errors.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import {
  AI_TOOL_IDS,
  IDE_TOOL_IDS,
  type IdeToolId,
  type ToolCategory,
  type ToolId,
} from "../../../kernel/tool.js";
import type { AiTool, IdeToolConfig } from "./contracts.js";

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

/**
 * The tool's native plugin CLI declaration, or undefined when it has none.
 * Read from the profile so the set of driven tools is data, not a hand-kept list.
 */
export function nativeActivationOf(toolId: ToolId): NativeActivation | undefined {
  const config = getToolConfig(toolId);
  if (config === undefined || !isAiTool(config)) return undefined;
  const caps = config.capabilities as {
    plugins?: { nativeActivation?: NativeActivation | null };
  };
  return caps.plugins?.nativeActivation ?? undefined;
}

/**
 * How the framework must be built for a tool: flat when the tool's plugins capability
 * is flat, a marketplace otherwise. Read from the profile rather than branched on the
 * tool's name, so a sixth flat tool needs no edit outside its own profile.
 */
export function frameworkBuildModeFor(toolId: ToolId): FrameworkBuildMode {
  const config = getToolConfig(toolId);
  if (config === undefined || !isAiTool(config)) return "marketplace";
  const caps = config.capabilities as { plugins?: { mode?: PluginsMode } };
  return caps.plugins?.mode === "flat" ? "flat" : "marketplace";
}

/**
 * Files this CLI writes for a tool and deliberately does not track.
 *
 * Their content names absolute paths, so they describe one machine: committing them
 * would hand a teammate a pointer that cannot resolve, and hashing them would make
 * every other machine read as drift. Untracked is the point, so neither `status` nor
 * the gitignore should treat them as something the user added.
 */
export function machineLocalFilesOf(toolId: ToolId): readonly string[] {
  const config = getToolConfig(toolId);
  if (config === undefined || !isAiTool(config)) return [];
  const caps = config.capabilities as {
    plugins?: { marketplaceSettings?: { marketplacesSettingsPath?: string | null } | null };
  };
  const path = caps.plugins?.marketplaceSettings?.marketplacesSettingsPath;
  // `null` means the tool has nowhere machine-local to write, so there is no such file
  // to keep out of `status` or the gitignore either.
  return typeof path === "string" ? [path] : [];
}

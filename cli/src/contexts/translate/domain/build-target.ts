import { AI_TOOL_IDS, type AiToolId, type ToolId } from "../../../kernel/tool.js";
import type { FrameworkBuildMode, ToolConfig } from "../../tools/domain/registry.js";
import { getAllRegisteredTools, isAiTool } from "../../tools/domain/registry.js";

/** The tool a framework build produces for. An alias rather than its own union: every AI tool
 * is buildable, so a sixth tool is a sixth target by construction, and writing the members
 * again would only create a second list to keep in step. */
export type FrameworkBuildTarget = AiToolId;

export interface FrameworkBuildTargetMode {
  readonly target: FrameworkBuildTarget;
  readonly mode: FrameworkBuildMode;
}

const BUILD_MODES: readonly FrameworkBuildMode[] = ["marketplace", "flat"];

/** A tool supports a mode when its profile declares a build contract for it. Exported so the
 * rule can be probed with synthetic tools — the version reading the live registry cannot say
 * what it would do with a tool that declares nothing. */
export function buildTargetModesOf(
  tools: ReadonlyMap<ToolId, ToolConfig>
): readonly FrameworkBuildTargetMode[] {
  const pairs: FrameworkBuildTargetMode[] = [];
  for (const target of AI_TOOL_IDS) {
    const config = tools.get(target);
    if (config === undefined || !isAiTool(config)) continue;
    for (const mode of BUILD_MODES) {
      if (config.buildContracts?.[mode] !== undefined) pairs.push({ target, mode });
    }
  }
  return pairs;
}

/** Every target/mode pair the build pipeline supports, read off the registered profiles. A
 * function and not a constant: the registry fills at wiring time, so a constant evaluated at
 * import would capture an empty one. */
export function frameworkBuildTargetModes(): readonly FrameworkBuildTargetMode[] {
  return buildTargetModesOf(getAllRegisteredTools());
}

/** Every target with at least one supported build mode. */
export function supportedBuildTargets(): readonly FrameworkBuildTarget[] {
  return [...new Set(frameworkBuildTargetModes().map((entry) => entry.target))];
}

export interface FrameworkBuildOptions {
  readonly sourceDir: string;
  readonly outDir: string;
  readonly target: FrameworkBuildTarget;
  /** Output layout. Defaults to "marketplace" (Mode A) when absent. */
  readonly mode?: FrameworkBuildMode;
}

export interface BuildPluginResult {
  readonly name: string;
  readonly filesWritten: number;
  readonly skippedSections: readonly string[];
}

export interface FrameworkBuildResult {
  readonly outDir: string;
  readonly plugins: readonly BuildPluginResult[];
  readonly totalFiles: number;
}

/** Path to the source (Claude-format) plugin manifest inside each plugin directory. */
export const SOURCE_PLUGIN_MANIFEST_RELATIVE = ".claude-plugin/plugin.json";

/** Path to the source (Claude-format) marketplace catalog. */
export const SOURCE_MARKETPLACE_RELATIVE = ".claude-plugin/marketplace.json";

export const PLUGIN_HOOKS_RELATIVE = "hooks/hooks.json";
export const PLUGIN_MCP_RELATIVE = ".mcp.json";
export const PLUGIN_AGENT_INPUT_EXT = ".md";
export const PLUGIN_SKILL_ENTRY_FILE = "SKILL.md";

/** Subdirectory names a build warns about and skips. */
export const OUT_OF_SCOPE_PLUGIN_SECTIONS: readonly ["commands", "rules"] = ["commands", "rules"];

import { COPILOT_VSCODE_MCP_PATH, COPILOT_WORKSPACE_DIR } from "../tools/ai/copilot-paths.js";

/** Build target: supported tool identifiers for framework build. */
export type FrameworkBuildTarget = "claude" | "cursor" | "copilot" | "codex" | "opencode";

/** Output layout discriminant: marketplace dist (Mode A) vs direct workspace inject (Mode B flat). */
export type FrameworkBuildMode = "marketplace" | "flat";

export interface FrameworkBuildOptions {
  readonly sourceDir: string;
  readonly outDir: string;
  readonly target: FrameworkBuildTarget;
  /** Output layout. Defaults to "marketplace" (Mode A) when absent. */
  readonly mode?: FrameworkBuildMode;
  /** When true, overwrite existing files at canonical flat paths. Only meaningful in flat mode. */
  readonly force?: boolean;
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

// --- Path constants ---

/** Path to the source (Claude-format) plugin manifest inside each plugin directory. */
export const SOURCE_PLUGIN_MANIFEST_RELATIVE = ".claude-plugin/plugin.json";

/** Path where the synthesized OpenPlugin-format plugin manifest is written. */
export const OUTPUT_PLUGIN_MANIFEST_RELATIVE = ".plugin/plugin.json";

/** Path to the source (Claude-format) marketplace catalog. */
export const SOURCE_MARKETPLACE_RELATIVE = ".claude-plugin/marketplace.json";

/** Path where the synthesized OpenPlugin-format marketplace catalog is written. */
export const OUTPUT_MARKETPLACE_RELATIVE = ".plugin/marketplace.json";

export const PLUGIN_HOOKS_RELATIVE = "hooks/hooks.json";
export const PLUGIN_MCP_RELATIVE = ".mcp.json";
export const PLUGIN_AGENT_INPUT_EXT = ".md";

/** Subdirectory names that are out-of-scope for MVP1 and receive a warn+skip. */
export const OUT_OF_SCOPE_PLUGIN_SECTIONS: readonly ["commands", "rules"] = ["commands", "rules"];

// --- Flat-mode canonical path prefixes ---

/** Output prefix for agents in flat mode: .github/agents/<plugin>/<name>.agent.md */
export const FLAT_GITHUB_AGENTS_PREFIX = `${COPILOT_WORKSPACE_DIR}agents/`;

/** Output prefix for skills in flat mode: .github/skills/<plugin>/<name>/ */
export const FLAT_GITHUB_SKILLS_PREFIX = `${COPILOT_WORKSPACE_DIR}skills/`;

/** Output prefix for hooks in flat mode: .github/hooks/<plugin>.hooks.json */
export const FLAT_GITHUB_HOOKS_PREFIX = `${COPILOT_WORKSPACE_DIR}hooks/`;

/** Path to the VS Code workspace MCP config merged in flat mode. */
export const FLAT_VSCODE_MCP_PATH = COPILOT_VSCODE_MCP_PATH;

/** File extension for agent files in flat output (workspace canonical). */
export const FLAT_AGENT_OUTPUT_EXT = ".agent.md";

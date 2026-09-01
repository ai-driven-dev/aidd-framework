import type { FrameworkBuildMode } from "../../tools/domain/registry.js";

/** Build target: supported tool identifiers for framework build. */
export type FrameworkBuildTarget = "claude" | "cursor" | "copilot" | "codex" | "opencode";

export interface FrameworkBuildTargetMode {
  readonly target: FrameworkBuildTarget;
  readonly mode: FrameworkBuildMode;
}

/**
 * Every target/mode combination the build pipeline supports — the single source of truth
 * for "which target:mode pairs exist". Infrastructure wiring (deps.ts's build registry)
 * must not diverge from this list; commands read it here, not through infrastructure.
 */
export const FRAMEWORK_BUILD_TARGET_MODES: readonly FrameworkBuildTargetMode[] = [
  { target: "claude", mode: "marketplace" },
  { target: "claude", mode: "flat" },
  { target: "cursor", mode: "marketplace" },
  { target: "cursor", mode: "flat" },
  { target: "copilot", mode: "marketplace" },
  { target: "copilot", mode: "flat" },
  { target: "codex", mode: "marketplace" },
  { target: "codex", mode: "flat" },
  { target: "opencode", mode: "flat" },
];

/** Every target with at least one supported build mode, derived from FRAMEWORK_BUILD_TARGET_MODES. */
export const SUPPORTED_BUILD_TARGETS: readonly FrameworkBuildTarget[] = [
  ...new Set(FRAMEWORK_BUILD_TARGET_MODES.map((entry) => entry.target)),
];

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

// --- Path constants ---

/** Path to the source (Claude-format) plugin manifest inside each plugin directory. */
export const SOURCE_PLUGIN_MANIFEST_RELATIVE = ".claude-plugin/plugin.json";

/** Path to the source (Claude-format) marketplace catalog. */
export const SOURCE_MARKETPLACE_RELATIVE = ".claude-plugin/marketplace.json";

export const PLUGIN_HOOKS_RELATIVE = "hooks/hooks.json";
export const PLUGIN_MCP_RELATIVE = ".mcp.json";
export const PLUGIN_AGENT_INPUT_EXT = ".md";
export const PLUGIN_SKILL_ENTRY_FILE = "SKILL.md";

/** Subdirectory names that are out-of-scope for MVP1 and receive a warn+skip. */
export const OUT_OF_SCOPE_PLUGIN_SECTIONS: readonly ["commands", "rules"] = ["commands", "rules"];

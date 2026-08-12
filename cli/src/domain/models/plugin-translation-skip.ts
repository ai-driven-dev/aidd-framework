import type { AiToolId } from "./tool-ids.js";

export interface PluginTranslationSkip {
  readonly pluginName: string;
  readonly component: "hooks" | "mcp" | "scripts";
  readonly toolId: AiToolId;
  readonly reason: string;
}

export type ReadonlySkipList = readonly PluginTranslationSkip[];

export const OPENCODE_HOOKS_SKIP_REASON =
  "OpenCode plugin runtime is JS modules; declarative hooks.json is not supported.";

export const GEMINI_HOOKS_SKIP_REASON =
  "Gemini hooks live in .gemini/settings.json under translated event names, which the flat plugin install path cannot express; use the framework build archive for hooks.";

/**
 * Why a tool skipped a plugin's declarative hooks. The tool's own capability supplies the
 * explanation when it has one; otherwise the message still names the tool it applies to,
 * rather than borrowing another tool's reason.
 */
export function hooksSkipReasonFor(toolId: AiToolId, declared: string | null): string {
  return declared ?? `${toolId} does not consume declarative hooks.json in flat plugin mode.`;
}

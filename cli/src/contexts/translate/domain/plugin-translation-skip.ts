import type { AiToolId } from "../../../kernel/tool.js";

export interface PluginTranslationSkip {
  readonly pluginName: string;
  readonly component: "hooks" | "mcp" | "scripts";
  readonly toolId: AiToolId;
  readonly reason: string;
}

export type ReadonlySkipList = readonly PluginTranslationSkip[];

export const OPENCODE_HOOKS_SKIP_REASON =
  "OpenCode plugin runtime is JS modules; declarative hooks.json is not supported.";

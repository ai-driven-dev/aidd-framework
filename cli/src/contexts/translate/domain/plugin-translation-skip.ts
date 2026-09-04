import type { AiToolId } from "../../../kernel/tool.js";

export interface PluginTranslationSkip {
  readonly pluginName: string;
  readonly component: "hooks" | "mcp" | "scripts";
  readonly toolId: AiToolId;
  readonly reason: string;
}

export type ReadonlySkipList = readonly PluginTranslationSkip[];

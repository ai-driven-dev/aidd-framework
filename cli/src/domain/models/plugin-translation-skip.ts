import type { AiToolId } from "./tool-ids.js";

export interface PluginTranslationSkip {
  readonly pluginName: string;
  readonly component: "hooks" | "mcp" | "scripts";
  readonly toolId: AiToolId;
  readonly reason: string;
}

export type ReadonlySkipList = readonly PluginTranslationSkip[];

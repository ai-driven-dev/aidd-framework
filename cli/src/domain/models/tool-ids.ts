import { UnknownAiToolIdError } from "../errors.js";

export type AiToolId = "claude" | "cursor" | "copilot" | "opencode" | "kilo" | "codex";
export type IdeToolId = "vscode";
export type ToolId = AiToolId | IdeToolId;
export type ToolCategory = "ai" | "ide";

export const AI_TOOL_IDS: readonly AiToolId[] = [
  "claude",
  "cursor",
  "copilot",
  "opencode",
  "kilo",
  "codex",
];
export const IDE_TOOL_IDS: readonly IdeToolId[] = ["vscode"];
export const VALID_TOOL_IDS: readonly ToolId[] = [...AI_TOOL_IDS, ...IDE_TOOL_IDS];

export function isAiToolId(id: string): id is AiToolId {
  return AI_TOOL_IDS.includes(id as AiToolId);
}

export function parseToolOption(tool: string | undefined): AiToolId[] | "all" {
  if (tool === undefined || tool === "all") return "all";
  return [tool as AiToolId];
}

export function assertValidAiToolId(tool: string | undefined): void {
  if (tool === undefined || tool === "all") return;
  if (!isAiToolId(tool)) {
    throw new UnknownAiToolIdError(tool, AI_TOOL_IDS);
  }
}

import { InvalidManifestToolIdError } from "../../../kernel/errors.js";
import { type ToolId, VALID_TOOL_IDS } from "../../../kernel/tool.js";
import {
  parseToolEntry,
  serializeToolEntry,
  type ToolEntry,
  type ToolEntryData,
} from "./manifest/tool-entry.js";

export const MANIFEST_VERSION = 6;

export interface ManifestData {
  version: 6;
  tools: Record<string, ToolEntryData>;
}

export function serializeManifestTools(
  tools: ReadonlyMap<ToolId, ToolEntry>
): Record<string, ToolEntryData> {
  const out: Record<string, ToolEntryData> = {};
  for (const [toolId, entry] of tools) {
    out[toolId] = serializeToolEntry(entry);
  }
  return out;
}

export function parseManifestTools(raw: Record<string, unknown>): Map<ToolId, ToolEntry> {
  const tools = new Map<ToolId, ToolEntry>();
  if (raw.tools === null || typeof raw.tools !== "object") return tools;

  for (const [key, value] of Object.entries(raw.tools as Record<string, unknown>)) {
    const toolId = key as ToolId;
    if (!VALID_TOOL_IDS.includes(toolId)) {
      throw new InvalidManifestToolIdError(key);
    }
    tools.set(toolId, parseToolEntry(toolId, value as ToolEntryData));
  }
  return tools;
}

import { InvalidManifestDataError, InvalidManifestToolIdError } from "../../../kernel/errors.js";
import { asPlainObject } from "../../../kernel/reading/plain-object.js";
import { type ToolId, VALID_TOOL_IDS } from "../../../kernel/tool.js";
import {
  parseToolEntry,
  serializeToolEntry,
  type ToolEntry,
  type ToolEntryData,
} from "./manifest/tool-entry.js";

export const MANIFEST_VERSION = 8;

export interface ManifestData {
  version: 8;
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
    tools.set(toolId, parseToolEntry(toolId, parseToolEntryData(key, value)));
  }
  return tools;
}

/** Narrows one `tools.<id>` entry before it reaches `parseToolEntry`, which otherwise
 * throws a raw `TypeError` from deep inside `parseTrackedFiles` for a manifest a person
 * hand-edited badly. Every failure names the JSON path so the message is actionable. */
function parseToolEntryData(toolId: string, value: unknown): ToolEntryData {
  const entry = asPlainObject(value);
  if (entry === null) {
    throw new InvalidManifestDataError(`tools.${toolId}: expected an object.`);
  }
  if (!Array.isArray(entry.files)) {
    const got = entry.files === undefined ? "missing" : typeof entry.files;
    throw new InvalidManifestDataError(`tools.${toolId}.files: expected an array, got ${got}.`);
  }
  return value as ToolEntryData;
}

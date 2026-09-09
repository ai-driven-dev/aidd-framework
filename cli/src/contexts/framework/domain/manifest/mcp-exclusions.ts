import { type McpExclusion, mcpExclusionEquals } from "../../../tools/domain/mcp-exclusion.js";

export interface McpExclusionData {
  configPath: string;
  entryKey: string;
}

export function addExclusions(
  existing: readonly McpExclusion[],
  toAdd: readonly McpExclusion[]
): McpExclusion[] {
  const result = [...existing];
  for (const excl of toAdd) {
    if (!result.some((e) => mcpExclusionEquals(e, excl))) {
      result.push(excl);
    }
  }
  return result;
}

export function removeExclusions(
  existing: readonly McpExclusion[],
  toRemove: readonly McpExclusion[]
): McpExclusion[] {
  return existing.filter((e) => !toRemove.some((r) => mcpExclusionEquals(e, r)));
}

export function toMcpExclusionData(exclusions: readonly McpExclusion[]): McpExclusionData[] {
  return exclusions.map((e) => ({ configPath: e.configPath, entryKey: e.entryKey }));
}

export function parseMcpExclusionData(data: readonly McpExclusionData[]): McpExclusion[] {
  return data.map((e) => ({ configPath: e.configPath, entryKey: e.entryKey }));
}

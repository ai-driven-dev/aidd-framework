import { DuplicatePluginError, PluginNotFoundError } from "../../../../kernel/errors.js";
import type { InstallationFile } from "../../../../kernel/file.js";
import type { MergeFileEntry } from "../../../../kernel/merge.js";
import type { ToolId } from "../../../../kernel/tool.js";
import type { McpExclusion } from "../../../tools/domain/mcp-exclusion.js";
import { InstalledPlugin, type PluginEntryData } from "../plugins/installed-plugin.js";
import {
  type McpExclusionData,
  parseMcpExclusionData,
  toMcpExclusionData,
} from "./mcp-exclusions.js";
import {
  type MergeFileEntryData,
  parseMergeFileEntries,
  toMergeFileEntryData,
} from "./merge-files.js";
import {
  type NativeRegistrations,
  type NativeRegistrationsData,
  parseNativeRegistrations,
  toNativeRegistrationsData,
} from "./native-registrations.js";
import {
  parseTrackedFiles,
  type TrackedFile,
  type TrackedFileData,
  toTrackedFileData,
  toTrackedFiles,
} from "./tracked-files.js";

// ── ToolEntry ────────────────────────────────────────────────────────────────
// One tool's slice of the record: what it wrote, what it co-owns, what it excluded,
// and which plugins it carries.

export interface ToolEntry {
  readonly toolId: ToolId;
  readonly version: string;
  readonly files: readonly TrackedFile[];
  readonly mergeFiles: readonly MergeFileEntry[];
  readonly excludedMcp: readonly McpExclusion[];
  readonly plugins: readonly InstalledPlugin[];
  /** What this tool's own CLI was asked to register, or `undefined` for a tool with
   * no `nativeActivation` — see {@link NativeRegistrations}. */
  readonly nativeRegistrations?: NativeRegistrations;
}

export interface ToolEntryData {
  toolId: string;
  version: string;
  files: TrackedFileData[];
  mergeFiles?: MergeFileEntryData[];
  excludedMcp?: McpExclusionData[];
  plugins?: PluginEntryData[];
  nativeRegistrations?: NativeRegistrationsData;
}

export function createToolEntry(params: {
  toolId: ToolId;
  version: string;
  files: InstallationFile[];
  mergeFiles: readonly MergeFileEntry[];
  excludedMcp: readonly McpExclusion[];
  existingPlugins: readonly InstalledPlugin[];
}): ToolEntry {
  return {
    toolId: params.toolId,
    version: params.version,
    files: toTrackedFiles(params.files),
    mergeFiles: params.mergeFiles,
    excludedMcp: params.excludedMcp,
    plugins: params.existingPlugins,
  };
}

export function addPluginToEntry(entry: ToolEntry, plugin: InstalledPlugin): ToolEntry {
  if (entry.plugins.some((p) => p.name === plugin.name)) {
    throw new DuplicatePluginError(plugin.name);
  }
  return { ...entry, plugins: [...entry.plugins, plugin] };
}

export function removePluginFromEntry(entry: ToolEntry, name: string): ToolEntry {
  if (!entry.plugins.some((p) => p.name === name)) {
    throw new PluginNotFoundError(name);
  }
  return { ...entry, plugins: entry.plugins.filter((p) => p.name !== name) };
}

export function updatePluginInEntry(entry: ToolEntry, plugin: InstalledPlugin): ToolEntry {
  if (!entry.plugins.some((p) => p.name === plugin.name)) {
    throw new PluginNotFoundError(plugin.name);
  }
  return {
    ...entry,
    plugins: entry.plugins.map((p) => (p.name === plugin.name ? plugin : p)),
  };
}

export function isFileTrackedInEntry(entry: ToolEntry, relativePath: string): boolean {
  if (entry.files.some((f) => f.relativePath === relativePath)) return true;
  if (entry.mergeFiles.some((m) => m.relativePath === relativePath)) return true;
  return entry.plugins.some((p) => p.isFileTracked(relativePath));
}

export function serializeToolEntry(entry: ToolEntry): ToolEntryData {
  return {
    toolId: entry.toolId,
    version: entry.version,
    files: toTrackedFileData(entry.files),
    mergeFiles: toMergeFileEntryData(entry.mergeFiles),
    ...(entry.excludedMcp.length > 0 && { excludedMcp: toMcpExclusionData(entry.excludedMcp) }),
    ...(entry.plugins.length > 0 && { plugins: entry.plugins.map((p) => p.toJSON()) }),
    ...(entry.nativeRegistrations !== undefined && {
      nativeRegistrations: toNativeRegistrationsData(entry.nativeRegistrations),
    }),
  };
}

export function parseToolEntry(toolId: ToolId, data: ToolEntryData): ToolEntry {
  return {
    toolId,
    version: data.version,
    files: parseTrackedFiles(data.files),
    mergeFiles: parseMergeFileEntries(data.mergeFiles ?? []),
    excludedMcp: parseMcpExclusionData(data.excludedMcp ?? []),
    plugins: (data.plugins ?? []).map((p) => InstalledPlugin.fromJSON(p)),
    nativeRegistrations: parseNativeRegistrations(data.nativeRegistrations),
  };
}

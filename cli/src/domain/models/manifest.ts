import {
  DuplicatePluginError,
  InvalidManifestDataError,
  InvalidManifestToolIdError,
  PluginNotFoundError,
  ToolNotInManifestError,
} from "../errors.js";
import { FileHash, type InstallationFile } from "./file.js";
import { type McpExclusion, mcpExclusionEquals } from "./mcp-exclusion.js";
import type { MergeFileEntry } from "./merge.js";
import { Plugin, type PluginEntryData } from "./plugin.js";
import { type ToolId, VALID_TOOL_IDS } from "./tool-ids.js";

const MANIFEST_VERSION = 6;

// VSCode file paths that were tracked under "copilot" in manifest v1.
// Used exclusively by migrateV1toV2 to move them to the "vscode" tool entry.
// It can only be removed when the manifest version is bumped again and v1 support is explicitly dropped.
const VSCODE_MIGRATION_PATHS = new Set([
  ".vscode/extensions.json",
  ".vscode/keybindings.json",
  ".vscode/settings.json",
]);

interface TrackedFile {
  readonly relativePath: string;
  readonly hash: FileHash;
  readonly frameworkPath?: string;
}

// Retained for legacy manifest round-trip and isFileTracked coverage.
interface ScriptsEntry {
  readonly version: string;
  readonly files: readonly TrackedFile[];
}

// Retained for legacy manifest round-trip and isFileTracked coverage.
interface PluginsEntry {
  readonly version: string;
  readonly files: readonly TrackedFile[];
}

/** How one tool comes to claim a tracked path. */
export type PathOwnerKind = "tool" | "merge" | "plugin";

/** One tool's claim on one tracked path. */
export interface PathOwner {
  readonly toolId: ToolId;
  readonly kind: PathOwnerKind;
  /** The plugin that installed the file, or null when the tool claims it directly. */
  readonly pluginName: string | null;
  /** Hash of the whole file, or null for a merge file, which tracks entries rather than bytes. */
  readonly hash: string | null;
}

/** Every tracked path with the owners that claim it. */
export type PathOwners = ReadonlyMap<string, readonly PathOwner[]>;

interface ToolEntry {
  readonly toolId: ToolId;
  readonly version: string;
  readonly files: readonly TrackedFile[];
  readonly mergeFiles: readonly MergeFileEntry[];
  readonly excludedMcp: readonly McpExclusion[];
  readonly plugins: readonly Plugin[];
}

// Kept for legacy manifest round-trip: v3/v4 manifests may carry these sections until migrate runs.
interface ScriptsEntryData {
  version: string;
  files: TrackedFileData[];
}

interface PluginsSectionData {
  version: string;
  files: TrackedFileData[];
}

interface ManifestData {
  version: 6;
  tools: Record<string, ToolEntryData>;
}

interface MergeFileEntryData {
  relativePath: string;
  sectionKey: string | null;
  entries: Record<string, string>;
}

interface ToolEntryData {
  toolId: string;
  version: string;
  files: TrackedFileData[];
  mergeFiles?: MergeFileEntryData[];
  excludedMcp?: Array<{ configPath: string; entryKey: string }>;
  plugins?: PluginEntryData[];
}

interface TrackedFileData {
  relativePath: string;
  hash: string;
  frameworkPath?: string;
}

// This migration block must remain until all users have upgraded past v1.
// Removing it would corrupt manifests that still have VSCode files tracked under "copilot".
function migrateV1toV2(raw: Record<string, unknown>): void {
  const tools = raw.tools as Record<string, ToolEntryData> | undefined;
  if (!tools) return;

  const copilot = tools.copilot;
  if (!copilot) return;

  const vscodeFiles = copilot.files.filter((f) => VSCODE_MIGRATION_PATHS.has(f.relativePath));
  if (vscodeFiles.length === 0) return;

  copilot.files = copilot.files.filter((f) => !VSCODE_MIGRATION_PATHS.has(f.relativePath));

  if (!tools.vscode) {
    tools.vscode = {
      toolId: "vscode",
      version: copilot.version,
      files: [],
      mergeFiles: [],
    };
  }
  const existingPaths = new Set(tools.vscode.files.map((f) => f.relativePath));
  const deduped = vscodeFiles.filter((f) => !existingPaths.has(f.relativePath));
  tools.vscode.files = [...tools.vscode.files, ...deduped];
}

function migrateV2toV3(raw: Record<string, unknown>): void {
  const tools = raw.tools as Record<string, ToolEntryData> | undefined;
  if (!tools) return;
  for (const entry of Object.values(tools)) {
    entry.plugins ??= [];
  }
}

function migrateV3toV4(raw: Record<string, unknown>): void {
  if (!("mode" in raw)) raw.mode = "local";
  if (!("plugins" in raw)) raw.plugins = null;
}

// Strips dead top-level fields: docs, mode, repo, docsDir, scripts, plugins.
// The legacy scripts/plugins file lists are parsed separately (parseLegacySections)
// before this strip, so removing them here during the round-trip is safe.
function migrateV4toV5(raw: Record<string, unknown>): void {
  delete raw.docs;
  delete raw.mode;
  delete raw.repo;
  delete raw.docsDir;
  delete raw.scripts;
  delete raw.plugins;
  if (!("marketplaces" in raw)) raw.marketplaces = {};
}

// Strips the dead marketplaces aggregate. The actual marketplace registry now lives
// exclusively in .aidd/marketplaces.json (managed by MarketplaceRegistryAdapter).
function migrateV5toV6(raw: Record<string, unknown>): void {
  delete raw.marketplaces;
}

export class Manifest {
  private readonly _tools: Map<ToolId, ToolEntry>;
  // Legacy _scripts/_plugins file lists retained so isFileTracked still recognises files
  // written by pre-v6 manifests (the fields themselves are stripped from serialized output).
  private _scripts: ScriptsEntry | null;
  private _plugins: PluginsEntry | null;

  private constructor(params: {
    tools: Map<ToolId, ToolEntry>;
    scripts: ScriptsEntry | null;
    plugins: PluginsEntry | null;
  }) {
    this._tools = new Map(params.tools);
    this._scripts = params.scripts;
    this._plugins = params.plugins;
  }

  static create(): Manifest {
    return new Manifest({
      tools: new Map(),
      scripts: null,
      plugins: null,
    });
  }

  addTool(
    toolId: ToolId,
    version: string,
    files: InstallationFile[],
    mergeFiles: MergeFileEntry[] = [],
    excludedMcp: McpExclusion[] = []
  ): void {
    const existing = this._tools.get(toolId);
    this._tools.set(toolId, {
      toolId,
      version,
      files: this.toTrackedFiles(files),
      mergeFiles,
      excludedMcp,
      plugins: existing?.plugins ?? [],
    });
  }

  /** Returns true when the loaded JSON carried a legacy scripts section. Used by isFileTracked. */
  hasScripts(): boolean {
    return this._scripts !== null;
  }

  /** Returns true when the loaded JSON carried a legacy top-level plugins section. Used by isFileTracked. */
  hasPlugins(): boolean {
    return this._plugins !== null;
  }

  private toTrackedFiles(files: InstallationFile[]): TrackedFile[] {
    return files.map((f) => ({
      relativePath: f.relativePath,
      hash: f.hash,
      ...(f.frameworkPath !== undefined && { frameworkPath: f.frameworkPath }),
    }));
  }

  getInstalledToolIds(): ToolId[] {
    return [...this._tools.keys()];
  }

  getToolFiles(
    toolId: ToolId
  ): ReadonlyArray<{ relativePath: string; hash: FileHash; frameworkPath?: string }> {
    return this._tools.get(toolId)?.files ?? [];
  }

  getMergeFiles(toolId: ToolId): readonly MergeFileEntry[] {
    return this._tools.get(toolId)?.mergeFiles ?? [];
  }

  /** Returns all tracked paths (files + merge files + plugin files) across all tools that start with the given directory prefix. */
  getTrackedPathsInDirectory(dir: string): Set<string> {
    const tracked = new Set<string>();
    for (const [, entry] of this._tools) {
      for (const f of entry.files) {
        if (f.relativePath.startsWith(dir)) tracked.add(f.relativePath);
      }
      for (const m of entry.mergeFiles) {
        if (m.relativePath.startsWith(dir)) tracked.add(m.relativePath);
      }
      for (const plugin of entry.plugins) {
        for (const relPath of plugin.files.keys()) {
          if (relPath.startsWith(dir)) tracked.add(relPath);
        }
      }
    }
    return tracked;
  }

  getExcludedMcp(toolId: ToolId): readonly McpExclusion[] {
    return this._tools.get(toolId)?.excludedMcp ?? [];
  }

  addExcludedMcp(toolId: ToolId, exclusions: McpExclusion[]): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    const existing = [...entry.excludedMcp];
    for (const excl of exclusions) {
      if (!existing.some((e) => mcpExclusionEquals(e, excl))) {
        existing.push(excl);
      }
    }
    this._tools.set(toolId, { ...entry, excludedMcp: existing });
  }

  removeExcludedMcp(toolId: ToolId, exclusions: McpExclusion[]): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    const filtered = entry.excludedMcp.filter(
      (e) => !exclusions.some((r) => mcpExclusionEquals(e, r))
    );
    this._tools.set(toolId, { ...entry, excludedMcp: filtered });
  }

  clearExcludedMcp(toolId: ToolId): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    this._tools.set(toolId, { ...entry, excludedMcp: [] });
  }

  updateTrackedFileHash(toolId: ToolId, relativePath: string, hash: FileHash): void {
    const entry = this._tools.get(toolId);
    if (!entry) return;
    const existing = entry.files.find((f) => f.relativePath === relativePath);
    const updatedFiles = existing
      ? entry.files.map((f) => (f.relativePath === relativePath ? { ...f, hash } : f))
      : [...entry.files, { relativePath, hash }];
    this._tools.set(toolId, { ...entry, files: updatedFiles });
  }

  updateToolMergeFiles(
    toolId: ToolId,
    mergeFiles: MergeFileEntry[],
    excludedMcp?: McpExclusion[]
  ): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    this._tools.set(toolId, {
      ...entry,
      mergeFiles,
      ...(excludedMcp !== undefined && { excludedMcp }),
    });
  }

  removeTool(toolId: ToolId): void {
    if (!this._tools.has(toolId)) {
      throw new ToolNotInManifestError(toolId);
    }
    this._tools.delete(toolId);
  }

  hasTool(toolId: ToolId): boolean {
    return this._tools.has(toolId);
  }

  getPlugins(toolId: ToolId): readonly Plugin[] {
    return this._tools.get(toolId)?.plugins ?? [];
  }

  addPlugin(toolId: ToolId, plugin: Plugin): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    if (entry.plugins.some((p) => p.name === plugin.name)) {
      throw new DuplicatePluginError(plugin.name);
    }
    this._tools.set(toolId, { ...entry, plugins: [...entry.plugins, plugin] });
  }

  removePlugin(toolId: ToolId, name: string): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    if (!entry.plugins.some((p) => p.name === name)) {
      throw new PluginNotFoundError(name);
    }
    this._tools.set(toolId, { ...entry, plugins: entry.plugins.filter((p) => p.name !== name) });
  }

  updatePlugin(toolId: ToolId, plugin: Plugin): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    if (!entry.plugins.some((p) => p.name === plugin.name)) {
      throw new PluginNotFoundError(plugin.name);
    }
    this._tools.set(toolId, {
      ...entry,
      plugins: entry.plugins.map((p) => (p.name === plugin.name ? plugin : p)),
    });
  }

  isFileTracked(relativePath: string): boolean {
    for (const entry of this._tools.values()) {
      if (entry.files.some((f) => f.relativePath === relativePath)) return true;
      if (entry.mergeFiles.some((m) => m.relativePath === relativePath)) return true;
      if (this.isFileTrackedInPlugins(entry.plugins, relativePath)) return true;
    }
    if (this._scripts?.files.some((f) => f.relativePath === relativePath)) return true;
    if (this._plugins?.files.some((f) => f.relativePath === relativePath)) return true;
    return false;
  }

  private isFileTrackedInPlugins(plugins: readonly Plugin[], relativePath: string): boolean {
    for (const plugin of plugins) {
      if (plugin.isFileTracked(relativePath)) return true;
    }
    return false;
  }

  getToolVersion(toolId: ToolId): string | undefined {
    return this._tools.get(toolId)?.version;
  }

  /**
   * Every tracked path with the owners that claim it, derived on read. No schema change:
   * co-ownership is already expressible, it was simply unreadable.
   *
   * A path can be claimed by several tools, and by a tool's plugins as well as by the tool
   * itself. Consumers that walk tool-and-path pairs cannot see that, which is how one owner
   * came to delete a tree another still needed. Hashes travel per owner, so a divergence
   * between two owners of one path stays visible instead of collapsing into one entry.
   */
  getPathOwners(): PathOwners {
    const owners = new Map<string, PathOwner[]>();
    for (const entry of this._tools.values()) this.collectPathOwners(owners, entry);
    return owners;
  }

  private collectPathOwners(owners: Map<string, PathOwner[]>, entry: ToolEntry): void {
    const toolId = entry.toolId;
    for (const file of entry.files) {
      addPathOwner(owners, file.relativePath, {
        toolId,
        kind: "tool",
        pluginName: null,
        hash: file.hash.value,
      });
    }
    for (const merge of entry.mergeFiles) {
      addPathOwner(owners, merge.relativePath, {
        toolId,
        kind: "merge",
        pluginName: null,
        hash: null,
      });
    }
    this.collectPluginOwners(owners, entry);
  }

  private collectPluginOwners(owners: Map<string, PathOwner[]>, entry: ToolEntry): void {
    for (const plugin of entry.plugins) {
      for (const [relativePath, hash] of plugin.files) {
        addPathOwner(owners, relativePath, {
          toolId: entry.toolId,
          kind: "plugin",
          pluginName: plugin.name,
          hash,
        });
      }
    }
  }

  getInstalledDirectories(): Set<string> {
    const dirs = new Set<string>();
    for (const entry of this._tools.values()) {
      for (const file of entry.files) {
        dirs.add(`${file.relativePath.split("/")[0]}/`);
      }
    }
    return dirs;
  }

  // --- Serialization ---

  toJSON(): ManifestData {
    const tools = this.serializeTools();
    return { version: MANIFEST_VERSION as 6, tools };
  }

  private serializeTools(): Record<string, ToolEntryData> {
    const tools: Record<string, ToolEntryData> = {};
    for (const [toolId, entry] of this._tools.entries()) {
      tools[toolId] = {
        toolId: entry.toolId,
        version: entry.version,
        files: this.toTrackedFileData(entry.files),
        mergeFiles: this.toMergeFileEntryData(entry.mergeFiles),
        ...(entry.excludedMcp.length > 0 && {
          excludedMcp: entry.excludedMcp.map((e) => ({
            configPath: e.configPath,
            entryKey: e.entryKey,
          })),
        }),
        ...(entry.plugins.length > 0 && {
          plugins: entry.plugins.map((p) => p.toJSON()),
        }),
      };
    }
    return tools;
  }

  private toTrackedFileData(files: readonly TrackedFile[]): TrackedFileData[] {
    return files.map((f) => ({
      relativePath: f.relativePath,
      hash: f.hash.value,
      ...(f.frameworkPath !== undefined && { frameworkPath: f.frameworkPath }),
    }));
  }

  private static parseTrackedFiles(files: TrackedFileData[]): TrackedFile[] {
    return files.map((f) => ({
      relativePath: f.relativePath,
      hash: new FileHash(f.hash),
      ...(f.frameworkPath !== undefined && { frameworkPath: f.frameworkPath }),
    }));
  }

  private toMergeFileEntryData(mergeFiles: readonly MergeFileEntry[]): MergeFileEntryData[] {
    return mergeFiles.map((m) => {
      const entries: Record<string, string> = {};
      for (const [key, hash] of Object.entries(m.entries)) {
        entries[key] = hash.value;
      }
      return {
        relativePath: m.relativePath,
        sectionKey: m.sectionKey,
        entries,
      };
    });
  }

  private static parseMergeFileEntries(data: MergeFileEntryData[]): MergeFileEntry[] {
    return data.map((m) => {
      const entries: Record<string, FileHash> = {};
      for (const [key, hash] of Object.entries(m.entries)) {
        entries[key] = new FileHash(hash);
      }
      return {
        relativePath: m.relativePath,
        sectionKey: m.sectionKey,
        entries,
      };
    });
  }

  static fromJSON(data: unknown): Manifest {
    if (data === null || typeof data !== "object") {
      throw new InvalidManifestDataError("expected an object.");
    }
    const raw = data as Record<string, unknown>;
    Manifest.applyMigrations(raw);
    const tools = Manifest.parseTools(raw);
    const { scripts, plugins } = Manifest.parseLegacySections(raw);
    return new Manifest({ tools, scripts, plugins });
  }

  private static applyMigrations(raw: Record<string, unknown>): void {
    const version = raw.version;
    if (version === 6) return;
    if (typeof version !== "number" || version < 1 || version > 6) {
      throw new InvalidManifestDataError(
        `Unsupported manifest version: ${String(version)}. Expected ${MANIFEST_VERSION}.`
      );
    }
    const migrations: ((r: Record<string, unknown>) => void)[] = [
      migrateV1toV2,
      migrateV2toV3,
      migrateV3toV4,
      migrateV4toV5,
      migrateV5toV6,
    ];
    for (const migrate of migrations.slice(version - 1)) {
      migrate(raw);
    }
  }

  private static parseTools(raw: Record<string, unknown>): Map<ToolId, ToolEntry> {
    const tools = new Map<ToolId, ToolEntry>();
    if (raw.tools === null || typeof raw.tools !== "object") return tools;

    for (const [key, value] of Object.entries(raw.tools as Record<string, unknown>)) {
      const toolId = key as ToolId;
      if (!VALID_TOOL_IDS.includes(toolId)) {
        throw new InvalidManifestToolIdError(key);
      }
      const entry = value as ToolEntryData;
      tools.set(toolId, {
        toolId,
        version: entry.version,
        files: Manifest.parseTrackedFiles(entry.files),
        mergeFiles: Manifest.parseMergeFileEntries(entry.mergeFiles ?? []),
        excludedMcp:
          entry.excludedMcp?.map((e) => ({ configPath: e.configPath, entryKey: e.entryKey })) ?? [],
        plugins: Manifest.parsePluginEntries(entry.plugins ?? []),
      });
    }
    return tools;
  }

  // Parse legacy scripts/plugins file lists for backward-compatible file tracking of pre-v6 manifests.
  private static parseLegacySections(raw: Record<string, unknown>): {
    scripts: ScriptsEntry | null;
    plugins: PluginsEntry | null;
  } {
    let scripts: ScriptsEntry | null = null;
    if (raw.scripts !== null && raw.scripts !== undefined && typeof raw.scripts === "object") {
      const scriptsRaw = raw.scripts as ScriptsEntryData;
      scripts = {
        version: scriptsRaw.version,
        files: Manifest.parseTrackedFiles(scriptsRaw.files),
      };
    }

    let plugins: PluginsEntry | null = null;
    if (raw.plugins !== null && raw.plugins !== undefined && typeof raw.plugins === "object") {
      const pluginsRaw = raw.plugins as PluginsSectionData;
      plugins = {
        version: pluginsRaw.version,
        files: Manifest.parseTrackedFiles(pluginsRaw.files),
      };
    }
    return { scripts, plugins };
  }

  private static parsePluginEntries(data: PluginEntryData[]): Plugin[] {
    return data.map((p) => Plugin.fromJSON(p));
  }
}

function addPathOwner(owners: Map<string, PathOwner[]>, path: string, owner: PathOwner): void {
  const existing = owners.get(path);
  if (existing === undefined) owners.set(path, [owner]);
  else existing.push(owner);
}

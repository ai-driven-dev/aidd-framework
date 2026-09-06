import { InvalidManifestDataError, ToolNotInManifestError } from "../../../kernel/errors.js";
import type { FileHash, InstallationFile } from "../../../kernel/file.js";
import type { MergeFileEntry } from "../../../kernel/merge.js";
import { AIDD_DIR, MANIFEST_FILENAME } from "../../../kernel/paths.js";
import type { ToolId } from "../../../kernel/tool.js";
import type { McpExclusion } from "../../tools/domain/mcp-exclusion.js";
import { addExclusions, removeExclusions } from "./manifest/mcp-exclusions.js";
import type { NativeRegistrations } from "./manifest/native-registrations.js";
import {
  addPluginToEntry,
  createToolEntry,
  isFileTrackedInEntry,
  removePluginFromEntry,
  type ToolEntry,
  updatePluginInEntry,
} from "./manifest/tool-entry.js";
import { withUpdatedHash } from "./manifest/tracked-files.js";
import {
  MANIFEST_VERSION,
  type ManifestData,
  parseManifestTools,
  serializeManifestTools,
} from "./manifest-serialization.js";
import type { InstalledPlugin } from "./plugins/installed-plugin.js";

// Where a stuck-on-an-old-version manifest lives, named in the refusal below so a
// person can act on it without hunting for the path themselves.
const MANIFEST_PATH_HINT = `${AIDD_DIR}/${MANIFEST_FILENAME}`;

export class Manifest {
  private readonly _tools: Map<ToolId, ToolEntry>;

  private constructor(params: { tools: Map<ToolId, ToolEntry> }) {
    this._tools = new Map(params.tools);
  }

  static create(): Manifest {
    return new Manifest({ tools: new Map() });
  }

  addTool(
    toolId: ToolId,
    version: string,
    files: InstallationFile[],
    mergeFiles: MergeFileEntry[] = [],
    excludedMcp: McpExclusion[] = []
  ): void {
    const existing = this._tools.get(toolId);
    this._tools.set(
      toolId,
      createToolEntry({
        toolId,
        version,
        files,
        mergeFiles,
        excludedMcp,
        existingPlugins: existing?.plugins ?? [],
      })
    );
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
    this._tools.set(toolId, {
      ...entry,
      excludedMcp: addExclusions(entry.excludedMcp, exclusions),
    });
  }

  removeExcludedMcp(toolId: ToolId, exclusions: McpExclusion[]): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    this._tools.set(toolId, {
      ...entry,
      excludedMcp: removeExclusions(entry.excludedMcp, exclusions),
    });
  }

  clearExcludedMcp(toolId: ToolId): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    this._tools.set(toolId, { ...entry, excludedMcp: [] });
  }

  updateTrackedFileHash(toolId: ToolId, relativePath: string, hash: FileHash): void {
    const entry = this._tools.get(toolId);
    if (!entry) return;
    this._tools.set(toolId, {
      ...entry,
      files: withUpdatedHash(entry.files, relativePath, hash),
    });
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

  getPlugins(toolId: ToolId): readonly InstalledPlugin[] {
    return this._tools.get(toolId)?.plugins ?? [];
  }

  addPlugin(toolId: ToolId, plugin: InstalledPlugin): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    this._tools.set(toolId, addPluginToEntry(entry, plugin));
  }

  removePlugin(toolId: ToolId, name: string): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    this._tools.set(toolId, removePluginFromEntry(entry, name));
  }

  updatePlugin(toolId: ToolId, plugin: InstalledPlugin): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    this._tools.set(toolId, updatePluginInEntry(entry, plugin));
  }

  getNativeRegistrations(toolId: ToolId): NativeRegistrations | undefined {
    return this._tools.get(toolId)?.nativeRegistrations;
  }

  setNativeRegistrations(toolId: ToolId, registrations: NativeRegistrations): void {
    const entry = this._tools.get(toolId);
    if (!entry) throw new ToolNotInManifestError(toolId);
    this._tools.set(toolId, { ...entry, nativeRegistrations: registrations });
  }

  isFileTracked(relativePath: string): boolean {
    for (const entry of this._tools.values()) {
      if (isFileTrackedInEntry(entry, relativePath)) return true;
    }
    return false;
  }

  getToolVersion(toolId: ToolId): string | undefined {
    return this._tools.get(toolId)?.version;
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
    return { version: MANIFEST_VERSION as 7, tools: serializeManifestTools(this._tools) };
  }

  static fromJSON(data: unknown): Manifest {
    if (data === null || typeof data !== "object") {
      throw new InvalidManifestDataError("expected an object.");
    }
    const raw = data as Record<string, unknown>;
    Manifest.assertSupportedVersion(raw);
    const tools = parseManifestTools(raw);
    return new Manifest({ tools });
  }

  // This CLI reads exactly MANIFEST_VERSION and refuses every other one, naming a fix for
  // each side. Too new means this CLI itself is behind, so `aidd update` is a real answer.
  //
  // Too old has no such answer: v6 to v7 was not a freebie like v6 itself was (the v6 cutover
  // only stopped accepting formats an already-published CLI, 5.2.2, could still migrate to and
  // re-save — see the deleted migration chain this replaced). v7 requires data — a mandatory
  // `scope` per plugin — that no published CLI has ever written, so no version number can be
  // named here that would actually get a stuck user unstuck: `ManifestRepositoryAdapter.load()`
  // calls `fromJSON` before any command reaches a save, so `setup`, `framework install` and
  // every other write path refuse an old document exactly as this method does, before they
  // ever get a chance to overwrite it. The only correction that does not first pass back
  // through this same guard is deleting the document outright, so that is what is named.
  private static assertSupportedVersion(raw: Record<string, unknown>): void {
    const version = raw.version;
    if (version === MANIFEST_VERSION) return;
    if (typeof version === "number" && version > MANIFEST_VERSION) {
      throw new InvalidManifestDataError(
        `manifest version ${version} was written by a newer CLI than this one. Run \`aidd update\` to update this CLI, then try again.`
      );
    }
    throw new InvalidManifestDataError(
      `manifest version ${String(version)} predates version ${MANIFEST_VERSION}, the only one this CLI reads. ` +
        `No published CLI can write this version: delete ${MANIFEST_PATH_HINT} in this project, then run ` +
        "`aidd setup` to reinstall the framework."
    );
  }
}

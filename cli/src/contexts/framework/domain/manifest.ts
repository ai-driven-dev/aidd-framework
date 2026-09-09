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

// The project-scope default, named in the refusal below so a person can act on it without hunting
// for the path. A caller reading the user-scope manifest passes its own `ManifestFileContext`, so
// the refusal names the file actually on disk.
const MANIFEST_PATH_HINT = `${AIDD_DIR}/${MANIFEST_FILENAME}`;
const DEFAULT_CONTEXT: ManifestFileContext = {
  path: MANIFEST_PATH_HINT,
  location: "in this project",
  reinstallCommand: "aidd setup",
};

/**
 * What a version-refusal message names: the file on disk, in words fitting the sentence it lands
 * in, and the command that reinstalls once it is gone. `UserManifestRepositoryAdapter` passes its
 * own before reaching the guard, so a `--scope user` refusal never names the project's path.
 */
export interface ManifestFileContext {
  readonly path: string;
  readonly location: string;
  readonly reinstallCommand: string;
}

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

  /** Tracked files, merge files and plugin files alike, across every tool. */
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

  toJSON(): ManifestData {
    return { version: MANIFEST_VERSION as 8, tools: serializeManifestTools(this._tools) };
  }

  static fromJSON(data: unknown, context: ManifestFileContext = DEFAULT_CONTEXT): Manifest {
    if (data === null || typeof data !== "object") {
      throw new InvalidManifestDataError("expected an object.");
    }
    const raw = data as Record<string, unknown>;
    Manifest.assertSupportedVersion(raw, context);
    const tools = parseManifestTools(raw);
    return new Manifest({ tools });
  }

  // This CLI reads exactly MANIFEST_VERSION and refuses every other one, naming a fix for each
  // side. Too new means this CLI is behind, so `aidd update` is a real answer.
  //
  // Too old has none: no published CLI ever wrote v7's mandatory per-plugin `scope` or v8's
  // host-name-beside-alias pair, and `load()` calls `fromJSON` before any command reaches a save,
  // so every write path refuses an old document before it could overwrite it. Deleting the
  // document is the only correction that does not pass back through this same guard.
  private static assertSupportedVersion(
    raw: Record<string, unknown>,
    context: ManifestFileContext
  ): void {
    const version = raw.version;
    if (version === MANIFEST_VERSION) return;
    if (typeof version === "number" && version > MANIFEST_VERSION) {
      throw new InvalidManifestDataError(
        `manifest version ${version} was written by a newer CLI than this one. Run \`aidd update\` to update this CLI, then try again.`
      );
    }
    // A v6 document is the one case admitting a remedy richer than deletion: 5.2.2's own manifest
    // reader accepts exactly version 6 — measured against that published version — so its
    // `clean --force` can still run against this project before the manifest naming what it
    // registered is gone. 5.2.2 refuses a v7 document too, so naming it there would be a false
    // remedy. A v6 document is one the project repository ever produced, never the user-scope one.
    const remedy =
      version === 6
        ? "5.2.2, a published CLI, wrote this version. Before deleting it, run " +
          "`npx @ai-driven-dev/cli@5.2.2 clean --force` in this project so it unregisters " +
          "what it registered and clears its own cache — once the manifest naming those " +
          "is gone, nothing can drive that anymore. Then delete"
        : "No published CLI can write this version: delete";
    throw new InvalidManifestDataError(
      `manifest version ${String(version)} predates version ${MANIFEST_VERSION}, the only one this CLI reads. ` +
        `${remedy} ${context.path} ${context.location}, then run ` +
        `\`${context.reinstallCommand}\` to reinstall the framework.`
    );
  }
}

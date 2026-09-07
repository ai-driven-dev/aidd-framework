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
// person can act on it without hunting for the path themselves. The project-scope
// default: a caller reading the user-scope manifest passes its own `ManifestFileContext`
// instead, so the refusal names the file actually on disk rather than this one.
const MANIFEST_PATH_HINT = `${AIDD_DIR}/${MANIFEST_FILENAME}`;
const DEFAULT_CONTEXT: ManifestFileContext = {
  path: MANIFEST_PATH_HINT,
  location: "in this project",
  reinstallCommand: "aidd setup",
};

/**
 * What a version-refusal message names: the file on disk, in words fitting the sentence
 * it lands in (`"in this project"`, `"for this machine"`), and the command that
 * reinstalls once it is gone. The one thing that differs between the project manifest
 * and the user-scope one — `UserManifestRepositoryAdapter` passes its own before ever
 * reaching this guard, so the message sent to a `--scope user` user names
 * `userConfigDir()/manifest.json` and `aidd setup --scope user`, never the project's own
 * path and command.
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

  // This CLI reads exactly MANIFEST_VERSION and refuses every other one, naming a fix for
  // each side. Too new means this CLI itself is behind, so `aidd update` is a real answer.
  //
  // Too old has no such answer: v6 to v7 was not a freebie like v6 itself was (the v6 cutover
  // only stopped accepting formats an already-published CLI, 5.2.2, could still migrate to and
  // re-save — see the deleted migration chain this replaced), and v7 to v8 is the same kind of
  // cutover again. v7 required data — a mandatory `scope` per plugin — that no published CLI
  // had ever written; v8 changes what `nativeRegistrations.marketplaces` holds per entry — the
  // host's own registered name beside aidd's own local alias, not the alias alone, once a
  // project's alias is free to differ from what its catalog declares itself (the divergence
  // this CLI used to refuse outright — see `architecture.md`). No published CLI has ever
  // written that pair either, so no version number can be named here that would actually get a
  // stuck user unstuck: `ManifestRepositoryAdapter.load()` calls `fromJSON` before any command
  // reaches a save, so `setup`, `framework install` and every other write path refuse an old
  // document exactly as this method does, before they ever get a chance to overwrite it. The
  // only correction that does not first pass back through this same guard is deleting the
  // document outright, so that is what is named. The message itself says which: a v6
  // document names 5.2.2 as the CLI that actually wrote it, since one did; v7 and below
  // say no published CLI can, since none ever did.
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
    // A v6 document is also the one case this method's own guard admits a remedy
    // richer than deletion for: 5.2.2's own manifest reader accepts exactly its native
    // version, 6 — measured against the published tag (`git show cli-v5.2.2`) — so its
    // `clean --force` can still be run against this project before the manifest naming
    // what it registered is gone. A v7 document has no such CLI: 5.2.2 refuses it too
    // ("Unsupported manifest version: 7"), so naming it there would be a false remedy.
    // The v6 remedy is written for the project manifest specifically — a v6 document is
    // one `ManifestRepositoryAdapter` ever produced, never `UserManifestRepositoryAdapter`
    // (which did not exist yet), so `context.location` is always "in this project" here.
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

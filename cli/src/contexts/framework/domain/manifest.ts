import { InvalidManifestDataError, ToolNotInManifestError } from "../../../kernel/errors.js";
import type { FileHash, InstallationFile } from "../../../kernel/file.js";
import type { MergeFileEntry } from "../../../kernel/merge.js";
import type { ToolId } from "../../../kernel/tool.js";
import type { McpExclusion } from "../../tools/domain/mcp-exclusion.js";
import { addExclusions, removeExclusions } from "./manifest/mcp-exclusions.js";
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

// The last published CLI whose manifest migrations could still read a pre-v6 document.
// v6 shipped 2026-05-09 (commit 273573fc) in 4.1.0-beta.25; 5.2.1 is the last version
// published before this guard replaced the migration chain. Named here so the refusal
// below can tell a user stuck on an old manifest exactly what to run first: downgrade,
// run it once to upgrade the manifest on disk, then update the CLI again.
const LAST_MIGRATING_CLI_VERSION = "5.2.1";

// `update` alone is not enough: a locally modified tracked file makes it throw
// InputRequiredError in non-interactive mode before it ever reaches the save that
// would persist the migrated v6 manifest, leaving the user exactly as stuck as before.
// `--force` removes that branch — verified empirically against 5.2.1 (plain manifest,
// modified-tracked-file manifest, and a zero-tool manifest all re-save as v6).
const RECOVERY_COMMAND = "update --force";

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
    return { version: MANIFEST_VERSION as 6, tools: serializeManifestTools(this._tools) };
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

  // This CLI reads exactly MANIFEST_VERSION: the migration chain that used to carry older
  // documents forward was removed once no supported CLI could still be behind v6 (see
  // LAST_MIGRATING_CLI_VERSION). A refusal alone would strand a user who self-updated before
  // opening an old project, so the two failure branches each name the fix: too old names the
  // last CLI able to migrate the manifest forward; too new means this CLI itself is behind.
  private static assertSupportedVersion(raw: Record<string, unknown>): void {
    const version = raw.version;
    if (version === MANIFEST_VERSION) return;
    if (typeof version === "number" && version > MANIFEST_VERSION) {
      throw new InvalidManifestDataError(
        `manifest version ${version} was written by a newer CLI than this one. Run \`aidd self-update\` to update this CLI, then try again.`
      );
    }
    throw new InvalidManifestDataError(
      `manifest version ${String(version)} predates version ${MANIFEST_VERSION}, the only one this CLI reads. ` +
        `Run \`npx @ai-driven-dev/cli@${LAST_MIGRATING_CLI_VERSION} ${RECOVERY_COMMAND}\` once in this project ` +
        `to upgrade the manifest (overwrites locally modified tracked files), then update the CLI again.`
    );
  }
}

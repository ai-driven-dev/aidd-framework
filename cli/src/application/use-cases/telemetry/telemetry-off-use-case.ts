import { dirname, join } from "node:path";
import type { TelemetrySettingsFileActivation } from "../../../domain/capabilities/telemetry-capability.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import {
  isMergeContentEmpty,
  type MergeFileEntry,
  removeEntriesFromJson,
} from "../../../domain/models/merge.js";
import {
  buildTelemetrySwitchFile,
  parseTelemetrySwitchFile,
  telemetryConfigPath,
} from "../../../domain/models/telemetry-switch.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import { getAiToolConfig } from "../../../domain/tools/registry.js";

export interface TelemetryOffOptions {
  readonly projectRoot: string;
}

export interface TelemetryOffResult {
  readonly switchPath: string;
  readonly switchChanged: boolean;
  readonly removedFiles: readonly string[];
  /** One line per `environment-variable`-activation tool, reminding the user AIDD never
   * set — and so cannot unset — the variable itself. Unconditional: whether the tool is
   * installed doesn't change that a shell might still have it exported. */
  readonly manualUnsetReminders: readonly string[];
}

/** `aidd telemetry off`'s judgement: sets the switch off (preserving the endpoint, since
 * the file is committed) and removes exactly the merge-file entries the manifest recorded
 * for each installed tool's `settings-file` activation — through the same
 * `removeEntriesFromJson` `aidd clean` already uses, never a second remover. A project
 * that was never on changes nothing. Knows nothing about any specific tool: which section
 * of which file to clean comes from that tool's `capabilities.telemetry`. */
export class TelemetryOffUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly manifestRepo: ManifestRepository,
    private readonly logger: Logger
  ) {}

  async execute(options: TelemetryOffOptions): Promise<TelemetryOffResult> {
    const switchPath = telemetryConfigPath(options.projectRoot);
    this.logger.info(`AIDD telemetry switch -> ${switchPath}`);
    const switchChanged = await this.turnSwitchOff(switchPath);
    const removedFiles = await this.removeTrackedTelemetryEntries(options.projectRoot);
    const manualUnsetReminders = this.buildManualUnsetReminders();
    return { switchPath, switchChanged, removedFiles, manualUnsetReminders };
  }

  private buildManualUnsetReminders(): string[] {
    const reminders: string[] = [];
    for (const toolId of AI_TOOL_IDS) {
      const { telemetry, displayName } = getAiToolConfig(toolId);
      if (telemetry.kind !== "environment-variable") continue;
      reminders.push(
        `${displayName}: if you exported ${telemetry.variable} yourself, unset it by hand.`
      );
    }
    return reminders;
  }

  private async turnSwitchOff(switchPath: string): Promise<boolean> {
    if (!(await this.fs.fileExists(switchPath))) {
      this.logger.info("AIDD telemetry: already off, unchanged.");
      return false;
    }
    const raw = await this.fs.readFile(switchPath);
    const current = parseTelemetrySwitchFile(raw);
    if (current?.enabled !== true) {
      this.logger.info("AIDD telemetry: already off, unchanged.");
      return false;
    }
    const next = buildTelemetrySwitchFile(raw, { enabled: false, endpoint: current.endpoint });
    await this.fs.writeFile(switchPath, next);
    this.logger.info("AIDD telemetry: off.");
    return true;
  }

  private async removeTrackedTelemetryEntries(projectRoot: string): Promise<string[]> {
    const manifest = await this.manifestRepo.load();
    if (manifest === null) return [];
    const removed: string[] = [];
    let touched = false;
    for (const toolId of AI_TOOL_IDS) {
      if (!manifest.hasTool(toolId)) continue;
      const cleaned = await this.removeToolEntries(manifest, toolId, projectRoot, removed);
      touched = touched || cleaned;
    }
    if (touched) await this.manifestRepo.save(manifest);
    return removed;
  }

  private async removeToolEntries(
    manifest: Manifest,
    toolId: AiToolId,
    projectRoot: string,
    removed: string[]
  ): Promise<boolean> {
    const { telemetry: activation } = getAiToolConfig(toolId);
    if (activation.kind !== "settings-file") return false;
    const entries = manifest
      .getMergeFiles(toolId)
      .filter((m) => m.sectionKey === activation.sectionKey);
    if (entries.length === 0) return false;
    for (const entry of entries)
      removed.push(...(await this.cleanEntry(toolId, projectRoot, entry)));
    this.untrackEntries(manifest, toolId, entries);
    return true;
  }

  private async cleanEntry(
    toolId: AiToolId,
    projectRoot: string,
    entry: MergeFileEntry
  ): Promise<string[]> {
    const fullPath = join(projectRoot, entry.relativePath);
    this.logger.info(`${toolId} telemetry -> ${fullPath}`);
    if (!(await this.fs.fileExists(fullPath))) {
      // Not necessarily "already deleted by hand": a --scope user entry is a `..`-prefixed
      // traversal from projectRoot (inherited caveat from phase 2), so it resolves wrong
      // if the project directory moved — leaving the real file still exporting, with no
      // manifest record left to undo it. Untracking proceeds regardless (repeating a
      // resolution that can't succeed on every future `off` helps nobody), but this must
      // never be silent.
      this.logger.warn(
        `Tracked telemetry entry not found at ${fullPath} — nothing removed there. ` +
          "If this project directory moved, check that path (or the real one) by hand."
      );
      return [];
    }
    const content = await this.fs.readFile(fullPath);
    const cleaned = removeEntriesFromJson(content, entry.sectionKey, Object.keys(entry.entries));
    if (isMergeContentEmpty(cleaned, entry.sectionKey)) {
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
    } else {
      await this.fs.writeFile(fullPath, cleaned);
    }
    return [fullPath];
  }

  private untrackEntries(
    manifest: Manifest,
    toolId: AiToolId,
    removedEntries: readonly MergeFileEntry[]
  ): void {
    const remaining = manifest
      .getMergeFiles(toolId)
      .filter(
        (m) =>
          !removedEntries.some(
            (r) => r.relativePath === m.relativePath && r.sectionKey === m.sectionKey
          )
      );
    manifest.updateToolMergeFiles(toolId, remaining);
  }
}

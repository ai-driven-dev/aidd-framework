import { relative } from "node:path";
import type {
  TelemetryScope,
  TelemetrySettingsFileActivation,
} from "../../../domain/capabilities/telemetry-capability.js";
import type { FileHash } from "../../../domain/models/file.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import { hashJsonEntries, type MergeFileEntry } from "../../../domain/models/merge.js";
import type { AiToolId } from "../../../domain/models/tool-ids.js";
import type { FileMerger } from "../../../domain/ports/file-merger.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import { NoManifestError } from "../../errors.js";

export interface EnableToolTelemetryOptions {
  readonly toolId: AiToolId;
  readonly activation: TelemetrySettingsFileActivation;
  readonly projectRoot: string;
  readonly homeDir: string;
  readonly endpoint: string | undefined;
  readonly projectId: string;
  readonly scope: TelemetryScope;
}

export interface EnableToolTelemetryResult {
  readonly settingsPath: string;
  readonly env: Readonly<Record<string, string>>;
}

/** Enables a tool's OTLP export by upserting the key set its `settings-file` activation
 * builds into the scope-resolved settings file, through the same merge-tracking machinery
 * `aidd clean` already knows how to undo. Never touches a key it did not add. Everything
 * about the tool's on-disk shape — where the file lives, what section holds the keys, what
 * the keys are — comes from `options.activation`; this class knows none of it. */
export class EnableToolTelemetryUseCase {
  constructor(
    private readonly fs: FileMerger,
    private readonly hasher: Hasher,
    private readonly manifestRepo: ManifestRepository,
    private readonly logger: Logger
  ) {}

  async execute(options: EnableToolTelemetryOptions): Promise<EnableToolTelemetryResult> {
    const manifest = await this.manifestRepo.load();
    if (manifest === null) throw new NoManifestError();
    const { activation, toolId } = options;
    const env = activation.buildEnv(options.endpoint, options.projectId);
    const settingsPath = activation.resolveSettingsPath(
      options.scope,
      options.projectRoot,
      options.homeDir
    );
    this.logger.info(`${toolId} telemetry -> ${settingsPath}`);
    const payload = JSON.stringify({ [activation.sectionKey]: env });
    await this.fs.mergeJsonFile(settingsPath, payload, "framework-prime");
    this.trackMergeFile(manifest, options, env, settingsPath);
    await this.manifestRepo.save(manifest);
    if (activation.postEnableNotice) this.logger.info(activation.postEnableNotice);
    return { settingsPath, env };
  }

  private trackMergeFile(
    manifest: Manifest,
    options: EnableToolTelemetryOptions,
    env: Readonly<Record<string, string>>,
    settingsPath: string
  ): void {
    const { toolId, activation, projectRoot } = options;
    const relativePath = relative(projectRoot, settingsPath).replace(/\\/g, "/");
    const entries: Record<string, FileHash> = hashJsonEntries(env, this.hasher);
    const newEntry: MergeFileEntry = { relativePath, sectionKey: activation.sectionKey, entries };
    const otherEntries = manifest
      .getMergeFiles(toolId)
      .filter((m) => !(m.relativePath === relativePath && m.sectionKey === activation.sectionKey));
    manifest.updateToolMergeFiles(toolId, [...otherEntries, newEntry]);
  }
}

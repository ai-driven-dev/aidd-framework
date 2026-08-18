import type {
  TelemetryActivation,
  TelemetryScope,
  TelemetrySettingsFileActivation,
} from "../../../domain/capabilities/telemetry-capability.js";
import {
  InvalidTelemetryEndpointError,
  MissingTelemetryEndpointError,
} from "../../../domain/errors.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import {
  buildTelemetrySwitchFile,
  isValidTelemetryEndpoint,
  parseTelemetrySwitchFile,
  type TelemetrySwitch,
  telemetryConfigPath,
} from "../../../domain/models/telemetry-switch.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import { getAiToolConfig } from "../../../domain/tools/registry.js";
import { TelemetryProjectScopeRequiresYesError } from "../../errors.js";
import type { EnableToolTelemetryUseCase } from "./enable-tool-telemetry-use-case.js";

export type TelemetryToolStatus =
  | "enabled"
  | "not-installed"
  | "not-yet-supported"
  | "not-a-file"
  | "cannot-enable";

export interface TelemetryToolReport {
  readonly tool: AiToolId;
  readonly status: TelemetryToolStatus;
  readonly detail: string;
}

export interface TelemetryOnOptions {
  readonly projectRoot: string;
  readonly homeDir: string;
  readonly endpoint: string | undefined;
  readonly scope: TelemetryScope;
  readonly confirmProjectScope: boolean;
}

export interface TelemetryOnResult {
  readonly switchPath: string;
  readonly switchChanged: boolean;
  readonly endpoint: string;
  readonly toolReports: readonly TelemetryToolReport[];
}

/** Builds the report for every activation kind AIDD cannot write to itself — a generic
 * switch over `kind`, never over a tool name. Every user-facing detail comes straight from
 * the activation the tool declared. */
function staticReportFor(
  toolId: AiToolId,
  activation: Exclude<TelemetryActivation, TelemetrySettingsFileActivation>
): TelemetryToolReport {
  const [status, detail] = staticStatusAndDetail(activation);
  return { tool: toolId, status, detail };
}

function staticStatusAndDetail(
  activation: Exclude<TelemetryActivation, TelemetrySettingsFileActivation>
): [TelemetryToolStatus, string] {
  switch (activation.kind) {
    case "environment-variable":
      return [
        "not-a-file",
        `Not a file — export ${activation.variable}=${activation.value} yourself; ` +
          "AIDD does not set environment variables.",
      ];
    case "planned":
      return [
        "not-yet-supported",
        `Not yet supported by AIDD — tracked in ${activation.trackedIn}.`,
      ];
    case "external":
      return ["cannot-enable", `${activation.reason} ${activation.remedy}`];
  }
}

/** `aidd telemetry on`'s judgement: writes the AIDD switch, then configures whichever
 * tools are installed and can be configured — reporting every one of the five states
 * honestly, never silently. Nothing is written when the project-scope guard refuses, or
 * when no endpoint can be resolved. Knows nothing about any specific tool: every per-tool
 * detail comes from that tool's `capabilities.telemetry` in the registry. */
export class TelemetryOnUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly manifestRepo: ManifestRepository,
    private readonly enableToolTelemetry: EnableToolTelemetryUseCase,
    private readonly logger: Logger,
    private readonly deriveProjectId: (repoRoot: string) => Promise<string>
  ) {}

  async execute(options: TelemetryOnOptions): Promise<TelemetryOnResult> {
    const switchPath = telemetryConfigPath(options.projectRoot);
    this.logger.info(`AIDD telemetry switch -> ${switchPath}`);
    this.guardTrackedScope(options);
    this.noteUserScopeCaveat(options);

    const existingRaw = await this.readIfExists(switchPath);
    const existingSwitch = existingRaw !== null ? parseTelemetrySwitchFile(existingRaw) : null;
    const endpoint = this.resolveEndpoint(options.endpoint, existingSwitch);

    const switchChanged = await this.writeSwitch(switchPath, existingRaw, existingSwitch, endpoint);
    const toolReports = await this.configureTools(options, endpoint);
    return { switchPath, switchChanged, endpoint, toolReports };
  }

  // Fires regardless of whether the blocking tool is installed — the same guarantee
  // `--scope project` without `--yes` writes nothing at all relies on, unconditionally.
  private guardTrackedScope(options: TelemetryOnOptions): void {
    if (options.confirmProjectScope) return;
    for (const toolId of AI_TOOL_IDS) {
      const { telemetry } = getAiToolConfig(toolId);
      if (telemetry.kind !== "settings-file" || !telemetry.trackedScopes.includes(options.scope)) {
        continue;
      }
      const activation = telemetry;
      const wouldBePath = activation.resolveSettingsPath(
        options.scope,
        options.projectRoot,
        options.homeDir
      );
      this.logger.info(`${toolId} telemetry (blocked, needs --yes) -> ${wouldBePath}`);
      throw new TelemetryProjectScopeRequiresYesError(wouldBePath);
    }
  }

  // MergeFileEntry.relativePath for --scope user is a `..`-prefixed traversal from
  // projectRoot to the home directory (inherited from phase 2). It resolves correctly
  // today; surfacing it here beats papering over what `off` may fail to find later.
  private noteUserScopeCaveat(options: TelemetryOnOptions): void {
    if (options.scope !== "user") return;
    this.logger.info(
      "Note: --scope user records the undo path relative to this project root — " +
        "if the project directory moves, `aidd telemetry off` may not find it."
    );
  }

  private resolveEndpoint(
    flagEndpoint: string | undefined,
    existing: TelemetrySwitch | null
  ): string {
    const endpoint = flagEndpoint?.trim() || existing?.endpoint;
    if (!endpoint) throw new MissingTelemetryEndpointError();
    if (!isValidTelemetryEndpoint(endpoint)) throw new InvalidTelemetryEndpointError(endpoint);
    return endpoint;
  }

  private async readIfExists(path: string): Promise<string | null> {
    return (await this.fs.fileExists(path)) ? await this.fs.readFile(path) : null;
  }

  private async writeSwitch(
    switchPath: string,
    existingRaw: string | null,
    existingSwitch: TelemetrySwitch | null,
    endpoint: string
  ): Promise<boolean> {
    if (existingSwitch?.enabled === true && existingSwitch.endpoint === endpoint) {
      this.logger.info("AIDD telemetry: already on, unchanged.");
      return false;
    }
    const next = buildTelemetrySwitchFile(existingRaw, { enabled: true, endpoint });
    await this.fs.writeFile(switchPath, next);
    this.logger.info("AIDD telemetry: on.");
    return true;
  }

  private async configureTools(
    options: TelemetryOnOptions,
    endpoint: string
  ): Promise<TelemetryToolReport[]> {
    const manifest = await this.manifestRepo.load();
    const reports: TelemetryToolReport[] = [];
    for (const toolId of AI_TOOL_IDS) {
      reports.push(await this.configureTool(toolId, manifest, options, endpoint));
    }
    return reports;
  }

  private async configureTool(
    toolId: AiToolId,
    manifest: Manifest | null,
    options: TelemetryOnOptions,
    endpoint: string
  ): Promise<TelemetryToolReport> {
    if (!manifest?.hasTool(toolId)) {
      return { tool: toolId, status: "not-installed", detail: "Not installed — skipped." };
    }
    return this.reportForActivation(toolId, getAiToolConfig(toolId).telemetry, options, endpoint);
  }

  private async reportForActivation(
    toolId: AiToolId,
    activation: TelemetryActivation,
    options: TelemetryOnOptions,
    endpoint: string
  ): Promise<TelemetryToolReport> {
    if (activation.kind === "settings-file") {
      return this.enableSettingsFileTool(toolId, activation, options, endpoint);
    }
    return staticReportFor(toolId, activation);
  }

  private async enableSettingsFileTool(
    toolId: AiToolId,
    activation: TelemetrySettingsFileActivation,
    options: TelemetryOnOptions,
    endpoint: string
  ): Promise<TelemetryToolReport> {
    const projectId = await this.deriveProjectId(options.projectRoot);
    const result = await this.enableToolTelemetry.execute({
      toolId,
      activation,
      projectRoot: options.projectRoot,
      homeDir: options.homeDir,
      endpoint,
      projectId,
      scope: options.scope,
    });
    return { tool: toolId, status: "enabled", detail: result.settingsPath };
  }
}

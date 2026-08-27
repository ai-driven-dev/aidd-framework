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
  isLoopbackTelemetryEndpoint,
  isValidTelemetryEndpoint,
} from "../../../domain/models/telemetry-switch.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../domain/models/tool-ids.js";
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

export interface TelemetryEndpointOptions {
  readonly projectRoot: string;
  readonly homeDir: string;
  readonly endpoint: string;
  readonly scope: TelemetryScope;
  readonly confirmProjectScope: boolean;
}

export interface TelemetryEndpointResult {
  readonly endpoint: string;
  readonly toolReports: readonly TelemetryToolReport[];
}

/** The report for every activation kind AIDD cannot write to itself. Switches over `kind`,
 * never over a tool name. */
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
      return ["not-yet-supported", `Not yet supported by AIDD — ${activation.missing}.`];
    case "external":
      return ["cannot-enable", `${activation.reason} ${activation.remedy}`];
  }
}

/** Makes installed tools emit OTLP telemetry to the given destination, configuring
 * whichever ones can be configured and reporting every state rather than skipping it.
 * Never touches the AIDD switch — `aidd telemetry on` owns that alone, and this use case
 * has no opinion about whether local recording is on. The endpoint always arrives typed
 * (the command requires it), so unlike the old `telemetry on --endpoint`, nothing here is
 * ever inherited from a file a repository could carry. */
export class TelemetryEndpointUseCase {
  constructor(
    private readonly manifestRepo: ManifestRepository,
    private readonly enableToolTelemetry: EnableToolTelemetryUseCase,
    private readonly logger: Logger,
    private readonly deriveProjectId: (repoRoot: string) => Promise<string>
  ) {}

  async execute(options: TelemetryEndpointOptions): Promise<TelemetryEndpointResult> {
    this.guardTrackedScope(options);
    this.noteUserScopeCaveat(options);
    const endpoint = this.validateEndpoint(options.endpoint);
    const toolReports = await this.configureTools(options, endpoint);
    return { endpoint, toolReports };
  }

  // Fires whether or not the blocking tool is installed, so `--scope project` without
  // `--yes` writes nothing at all.
  private guardTrackedScope(options: TelemetryEndpointOptions): void {
    if (options.confirmProjectScope) return;
    for (const toolId of AI_TOOL_IDS) {
      const { telemetry } = getAiToolConfig(toolId);
      if (telemetry.kind !== "settings-file" || !telemetry.trackedScopes.includes(options.scope)) {
        continue;
      }
      const wouldBePath = telemetry.resolveSettingsPath(
        options.scope,
        options.projectRoot,
        options.homeDir
      );
      this.logger.info(`${toolId} telemetry (blocked, needs --yes) -> ${wouldBePath}`);
      throw new TelemetryProjectScopeRequiresYesError(wouldBePath);
    }
  }

  // MergeFileEntry.relativePath for --scope user is a `..`-prefixed traversal from
  // projectRoot to the home directory, so it breaks if the project directory moves.
  private noteUserScopeCaveat(options: TelemetryEndpointOptions): void {
    if (options.scope !== "user") return;
    this.logger.info(
      "Note: --scope user records the undo path relative to this project root — " +
        "if the project directory moves, `aidd telemetry endpoint clear` may not find it."
    );
  }

  private validateEndpoint(rawEndpoint: string): string {
    const endpoint = rawEndpoint.trim();
    if (!endpoint) throw new MissingTelemetryEndpointError();
    if (!isValidTelemetryEndpoint(endpoint)) throw new InvalidTelemetryEndpointError(endpoint);
    if (!isLoopbackTelemetryEndpoint(endpoint)) {
      this.logger.warn(
        `Telemetry endpoint ${endpoint} is not on this machine. What a tool exports carries ` +
          "an email address; sending it there is a choice you just made by typing it."
      );
    }
    return endpoint;
  }

  private async configureTools(
    options: TelemetryEndpointOptions,
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
    options: TelemetryEndpointOptions,
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
    options: TelemetryEndpointOptions,
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
    options: TelemetryEndpointOptions,
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

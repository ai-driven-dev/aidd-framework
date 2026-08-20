import type { TelemetryExportDeclared } from "../../../domain/capabilities/telemetry-capability.js";
import {
  mapOtlpLogsToSinkRecords,
  mapOtlpMetricsToSinkRecords,
  type TelemetrySessionMeasure,
  type TelemetryVendorIdentity,
} from "../../../domain/models/telemetry-sink-record.js";
import {
  DEFAULT_TELEMETRY_SINK_RETENTION_DAYS,
  decideTelemetrySinkRetention,
} from "../../../domain/models/telemetry-sink-retention.js";
import { AI_TOOL_IDS } from "../../../domain/models/tool-ids.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { TelemetrySink } from "../../../domain/ports/telemetry-sink.js";
import { getAiToolConfig } from "../../../domain/tools/registry.js";

export type TelemetryOtlpPath = "/v1/logs" | "/v1/metrics" | "/v1/traces";

export interface TelemetryReceiveStartResult {
  readonly rootDir: string;
}

function declaredExports(): readonly TelemetryExportDeclared[] {
  const declared: TelemetryExportDeclared[] = [];
  for (const toolId of AI_TOOL_IDS) {
    const shape = getAiToolConfig(toolId).telemetryExport;
    if (shape.kind === "declared") declared.push(shape);
  }
  return declared;
}

function declaredVendorIdentities(): readonly TelemetryVendorIdentity[] {
  return declaredExports().map(({ identityAttribute, turnAttribute }) => ({
    identityAttribute,
    turnAttribute,
  }));
}

function declaredSessionMeasures(): readonly TelemetrySessionMeasure[] {
  return declaredExports().flatMap((shape) => shape.sessionMeasures ?? []);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ReceiveTelemetryUseCase {
  constructor(
    private readonly sink: TelemetrySink,
    private readonly logger: Logger,
    private readonly retentionDays: number = DEFAULT_TELEMETRY_SINK_RETENTION_DAYS
  ) {}

  /** Throws if the sink directory cannot be created or written to; the caller must not
   * start listening on that error. */
  async start(): Promise<TelemetryReceiveStartResult> {
    await this.sink.ensureWritable();
    return { rootDir: this.sink.rootDir };
  }

  /** `payload` is already-parsed JSON. `/v1/traces` is accepted and dropped: no tool
   * measured so far puts a billed request on a span this layer reads. */
  async receive(
    path: TelemetryOtlpPath,
    payload: unknown,
    receivedAt: Date = new Date()
  ): Promise<void> {
    if (path === "/v1/traces") return;

    const vendors = declaredVendorIdentities();
    const records =
      path === "/v1/logs"
        ? mapOtlpLogsToSinkRecords(payload, vendors)
        : mapOtlpMetricsToSinkRecords(payload, vendors, declaredSessionMeasures());

    for (const record of records) {
      const { dayFileIsNew } = await this.sink.appendRecord(record, receivedAt);
      if (dayFileIsNew) await this.pruneOldDayFiles();
    }
  }

  // Catches under the long-lived-process carve-out: the payload that triggered this is
  // already stored, and a housekeeping failure must not cost it.
  private async pruneOldDayFiles(): Promise<void> {
    let prune: readonly string[];
    try {
      prune = decideTelemetrySinkRetention(
        await this.sink.listDayFiles(),
        this.retentionDays
      ).prune;
    } catch (error) {
      this.logger.warn(`telemetry receive: retention prune failed — ${errorMessage(error)}`);
      return;
    }
    // Per file, so one that cannot be deleted does not spare every older one behind it.
    for (const fileName of prune) {
      try {
        await this.sink.deleteDayFile(fileName);
      } catch (error) {
        this.logger.warn(
          `telemetry receive: could not delete ${fileName} — ${errorMessage(error)}`
        );
      }
    }
  }
}

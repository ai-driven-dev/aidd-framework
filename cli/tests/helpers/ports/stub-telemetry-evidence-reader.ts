import type { TelemetryExportLeftover } from "../../../src/domain/models/telemetry-export-leftover.js";
import type {
  TelemetryEvidenceReader,
  TelemetryUnrecognisedPayload,
} from "../../../src/domain/ports/telemetry-evidence-reader.js";

/** Shared by every test that needs `TelemetryEvidenceReader` without a real config file on
 * disk — `enabled` defaults to `true` since that is the ordinary case a report or a check
 * runs against; a test that cares about the off state sets it explicitly. `leftoverExport`
 * defaults to empty — a machine with nothing left over — for the same reason. */
export class StubTelemetryEvidenceReader implements TelemetryEvidenceReader {
  enabled = true;
  unrecognisedPayload: TelemetryUnrecognisedPayload | null = null;
  leftoverExport: readonly TelemetryExportLeftover[] = [];

  async isTelemetryEnabled(): Promise<boolean> {
    return this.enabled;
  }

  async readUnrecognisedPayload(): Promise<TelemetryUnrecognisedPayload | null> {
    return this.unrecognisedPayload;
  }

  async findLeftoverExportConfig(): Promise<readonly TelemetryExportLeftover[]> {
    return this.leftoverExport;
  }
}

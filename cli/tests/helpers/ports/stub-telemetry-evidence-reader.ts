import type {
  TelemetryEvidenceReader,
  TelemetrySwitchSetupRead,
  TelemetryUnrecognisedPayload,
} from "../../../src/contexts/telemetry/domain/ports/telemetry-evidence-reader.js";
import type { TelemetryExportLeftover } from "../../../src/contexts/telemetry/domain/telemetry-export-leftover.js";
import type { TelemetryRecorderDeclarationSetup } from "../../../src/contexts/telemetry/domain/telemetry-setup.js";

/** `TelemetryEvidenceReader` without a real config file on disk. Every field defaults to the
 * ordinary clean-machine state, so a test sets only the one it cares about. */
export class StubTelemetryEvidenceReader implements TelemetryEvidenceReader {
  enabled = true;
  unrecognisedPayload: TelemetryUnrecognisedPayload | null = null;
  leftoverExport: readonly TelemetryExportLeftover[] = [];
  switchSetup: TelemetrySwitchSetupRead = {
    path: "/repo/.aidd/config.json",
    enabled: false,
    readable: true,
  };
  recorderDeclaration: TelemetryRecorderDeclarationSetup = {
    declared: false,
    declaredAt: [],
    locationsChecked: ["/repo/.aidd/manifest.json"],
    unreadable: [],
  };

  async isTelemetryEnabled(): Promise<boolean> {
    return this.enabled;
  }

  async readUnrecognisedPayload(): Promise<TelemetryUnrecognisedPayload | null> {
    return this.unrecognisedPayload;
  }

  async findLeftoverExportConfig(): Promise<readonly TelemetryExportLeftover[]> {
    return this.leftoverExport;
  }

  async readSwitchSetup(): Promise<TelemetrySwitchSetupRead> {
    return this.switchSetup;
  }

  async readRecorderDeclaration(): Promise<TelemetryRecorderDeclarationSetup> {
    return this.recorderDeclaration;
  }
}

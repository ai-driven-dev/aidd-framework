import {
  buildTelemetrySwitchFile,
  parseTelemetrySwitchFile,
  telemetryConfigPath,
} from "../../../domain/models/telemetry-switch.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Logger } from "../../../domain/ports/logger.js";

export interface TelemetryOffOptions {
  readonly projectRoot: string;
}

export interface TelemetryOffResult {
  readonly switchPath: string;
  readonly switchChanged: boolean;
}

/** Sets the switch off, preserving whatever endpoint the file already carries since this
 * use case has no opinion about it. Touches nothing else: a tool's own settings file is
 * `aidd telemetry endpoint clear`'s job now, not this one's — an `off` that still removed
 * an export configuration nobody asked it to touch would erase somebody's real setup the
 * moment they turned off the local journal. */
export class TelemetryOffUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly logger: Logger
  ) {}

  async execute(options: TelemetryOffOptions): Promise<TelemetryOffResult> {
    const switchPath = telemetryConfigPath(options.projectRoot);
    this.logger.info(`AIDD telemetry switch -> ${switchPath}`);
    const switchChanged = await this.turnSwitchOff(switchPath);
    return { switchPath, switchChanged };
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
}

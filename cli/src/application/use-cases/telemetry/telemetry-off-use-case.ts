import {
  buildTelemetrySwitchFile,
  parseTelemetrySwitchFile,
  telemetryConfigPath,
} from "../../../domain/models/telemetry-switch.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { TelemetryEvidenceReader } from "../../../domain/ports/telemetry-evidence-reader.js";

export interface TelemetryOffOptions {
  readonly projectRoot: string;
}

export interface TelemetryOffResult {
  readonly switchPath: string;
  readonly switchChanged: boolean;
}

/** Sets the switch off, preserving whatever `endpoint` the file already carries — see its
 * declaration in `telemetry-switch.ts` for why. Never edits a tool's own settings file:
 * no command left in this system writes one, so there is none this could safely undo
 * either — an `off` that started editing a file nobody here wrote could erase somebody's
 * real setup the moment they turned off the local journal. It only warns when one still
 * carries a stale export configuration; see `warnLeftoverExportConfig` below. */
export class TelemetryOffUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly logger: Logger,
    private readonly telemetryEvidenceReader: TelemetryEvidenceReader
  ) {}

  async execute(options: TelemetryOffOptions): Promise<TelemetryOffResult> {
    const switchPath = telemetryConfigPath(options.projectRoot);
    this.logger.info(`AIDD telemetry switch -> ${switchPath}`);
    const switchChanged = await this.turnSwitchOff(switchPath);
    await this.warnLeftoverExportConfig(options.projectRoot);
    return { switchPath, switchChanged };
  }

  /** Names what `off` cannot touch: a tool's own settings file, still carrying a key
   * `aidd telemetry endpoint` wrote before that command was deleted. Silence here is
   * exactly the failure this exists to close — a person who ran that command has no other
   * way left to learn their machine is still exporting. */
  private async warnLeftoverExportConfig(projectRoot: string): Promise<void> {
    const leftovers = await this.telemetryEvidenceReader.findLeftoverExportConfig(projectRoot);
    for (const leftover of leftovers) {
      this.logger.warn(
        `${leftover.path} still sets ${leftover.keys.join(", ")} — this switch cannot ` +
          "touch a tool's own settings file. Delete these keys from its `env` block by " +
          "hand to stop that export."
      );
    }
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

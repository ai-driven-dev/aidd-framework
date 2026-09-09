import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../kernel/ports/logger.js";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  SESSION_TRAILER_TOKEN,
  sessionTrailerManagerSnippet,
} from "../domain/formats/commit-session-trailer.js";
import type { TelemetryEvidenceReader } from "../domain/ports/telemetry-evidence-reader.js";
import type { VersionControl } from "../domain/ports/version-control.js";
import {
  buildTelemetrySwitchFile,
  parseTelemetrySwitchFile,
  telemetryConfigPath,
} from "../domain/telemetry-switch.js";

export interface TelemetryOffOptions {
  readonly projectRoot: string;
}

export interface TelemetryOffResult {
  readonly switchPath: string;
  readonly switchChanged: boolean;
}

/** Sets the switch off, preserving any `endpoint` the file already carries. Never edits a tool's
 * own settings file: nothing here wrote one, so editing it could erase somebody's real setup. */
export class TelemetryOffUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly logger: Logger,
    private readonly telemetryEvidenceReader: TelemetryEvidenceReader,
    private readonly git: VersionControl
  ) {}

  async execute(options: TelemetryOffOptions): Promise<TelemetryOffResult> {
    const switchPath = telemetryConfigPath(options.projectRoot);
    this.logger.info(`AIDD telemetry switch -> ${switchPath}`);
    const switchChanged = await this.turnSwitchOff(switchPath);
    await this.stopTrailingCommits(options.projectRoot);
    await this.warnLeftoverExportConfig(options.projectRoot);
    return { switchPath, switchChanged };
  }

  /** `on` wrote the hook line and the delegate, so `off` takes both back — whatever the switch's
   * previous state was: already off with the hook installed is what a second `off` must fix. */
  private async stopTrailingCommits(projectRoot: string): Promise<void> {
    const result = await this.git.removeCommitMessageDelegate(
      projectRoot,
      SESSION_TRAILER_DELEGATE_FILE
    );
    if (result.removed) {
      this.logger.info(
        `New commits will carry no ${SESSION_TRAILER_TOKEN} trailer. Commits already made ` +
          "keep theirs — nothing here rewrites history."
      );
    }
    // A manager's own config is committed, shared config this CLI never writes, so the job
    // calling the removed delegate stays — its own `[ -f ]` guard now finds nothing to run.
    if (result.hookManager !== undefined && result.managerCallsDelegate === true) {
      const { targetFile } = sessionTrailerManagerSnippet(
        result.hookManager,
        SESSION_TRAILER_DELEGATE_FILE
      );
      this.logger.info(
        `${targetFile} still calls the delegate this just removed — that file is not this ` +
          "CLI's to edit, so the job is left in place. Its own `[ -f ]` guard now finds " +
          "nothing there, so it runs nothing; delete it from " +
          `${targetFile} by hand if you want it gone too.`
      );
    }
  }

  /** Names what `off` cannot touch: a tool's own settings file still carrying an export key.
   * Silence is the failure this closes — nothing else tells a person their machine exports. */
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

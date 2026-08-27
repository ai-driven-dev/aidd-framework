import { DOCS_DIR } from "../../../domain/models/paths.js";
import {
  buildTelemetrySwitchFile,
  parseTelemetrySwitchFile,
  type TelemetrySwitch,
  telemetryConfigPath,
} from "../../../domain/models/telemetry-switch.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { VersionControl } from "../../../domain/ports/version-control.js";
import type { GitignoreUseCase } from "../shared/gitignore-use-case.js";

export interface TelemetryOnOptions {
  readonly projectRoot: string;
}

export interface TelemetryOnResult {
  readonly switchPath: string;
  readonly switchChanged: boolean;
}

const RUNS_ENTRY = `${DOCS_DIR}/runs/`;

/** Owns the AIDD telemetry switch alone: flips `.aidd/config.json`'s `telemetry.enabled`
 * and git-ignores the run journal. Never touches a tool's own settings file — that is
 * `aidd telemetry endpoint`'s job, because arming a tool to export and recording locally
 * are two different promises. Any endpoint already recorded in the switch file is
 * preserved untouched, since this use case has no opinion about it either way. */
export class TelemetryOnUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly logger: Logger,
    private readonly gitignoreUseCase: GitignoreUseCase,
    private readonly git: VersionControl
  ) {}

  async execute(options: TelemetryOnOptions): Promise<TelemetryOnResult> {
    const switchPath = telemetryConfigPath(options.projectRoot);
    this.logger.info(`AIDD telemetry switch -> ${switchPath}`);
    const switchChanged = await this.writeSwitch(switchPath);
    await this.protectRunsDir(options.projectRoot);
    return { switchPath, switchChanged };
  }

  // Every successful `on` re-checks this, switch newly written or not — the same rule
  // `journal-privacy.cjs` followed from `telemetry-switch.cjs`, and the reason: a project
  // turned on before this existed must still get caught up on ignoring the journal and on
  // naming anything git already tracks, without a person having to turn it off and on again.
  private async protectRunsDir(projectRoot: string): Promise<void> {
    const added = await this.gitignoreUseCase.execute(projectRoot, [RUNS_ENTRY]);
    if (added) {
      this.logger.info(
        `Added ${RUNS_ENTRY} to .gitignore — the journal names who worked on what and for ` +
          "how long. Delete that line to commit it instead."
      );
    }
    const tracked = await this.git.listTrackedFiles(projectRoot, RUNS_ENTRY);
    if (tracked.length === 0) return;
    this.logger.warn(
      "Already tracked by git — who worked on what, for how long, and every file written:\n" +
        `${tracked.map((file) => `  ${file}`).join("\n")}\nNothing removed or rewritten — your call.`
    );
  }

  private async readIfExists(path: string): Promise<string | null> {
    return (await this.fs.fileExists(path)) ? await this.fs.readFile(path) : null;
  }

  private async writeSwitch(switchPath: string): Promise<boolean> {
    const existingRaw = await this.readIfExists(switchPath);
    const existing: TelemetrySwitch | null =
      existingRaw !== null ? parseTelemetrySwitchFile(existingRaw) : null;
    if (existing?.enabled === true) {
      this.logger.info("AIDD telemetry: already on, unchanged.");
      return false;
    }
    const next = buildTelemetrySwitchFile(existingRaw, {
      enabled: true,
      endpoint: existing?.endpoint,
    });
    await this.fs.writeFile(switchPath, next);
    this.logger.info("AIDD telemetry: on.");
    return true;
  }
}

import { TelemetryProjectScopeRequiresYesError } from "../../../kernel/errors.js";
import { RUNS_ENTRY } from "../../../kernel/paths.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../kernel/ports/logger.js";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  SESSION_TRAILER_TOKEN,
  sessionTrailerDelegateScript,
  sessionTrailerManagerInstruction,
  sessionTrailerManagerSnippet,
} from "../domain/formats/commit-session-trailer.js";
import type { IgnoreEntries } from "../domain/ports/ignore-entries.js";
import type { TelemetrySink } from "../domain/ports/telemetry-sink.js";
import type { VersionControl } from "../domain/ports/version-control.js";
import type { HookManager } from "../domain/telemetry-setup.js";
import {
  buildTelemetrySwitchFile,
  parseTelemetrySwitchFile,
  type TelemetrySwitch,
  telemetryConfigPath,
} from "../domain/telemetry-switch.js";

export interface TelemetryOnOptions {
  readonly projectRoot: string;
  /** `.aidd/config.json` is git-tracked, so a fresh clone inherits the project's decision —
   * which is why anyone is asked at all. */
  readonly confirmed: boolean;
}

export interface TelemetryOnResult {
  readonly switchPath: string;
  readonly switchChanged: boolean;
}

/** Owns the AIDD telemetry switch alone: flips `.aidd/config.json`'s `telemetry.enabled` and
 * git-ignores the run journal. Never touches a tool's own settings file — arming a tool to
 * export and recording locally are two different promises. Any `endpoint` there is preserved. */
export class TelemetryOnUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly logger: Logger,
    private readonly gitignore: IgnoreEntries,
    private readonly git: VersionControl,
    private readonly sink: TelemetrySink
  ) {}

  async execute(options: TelemetryOnOptions): Promise<TelemetryOnResult> {
    const switchPath = telemetryConfigPath(options.projectRoot);
    this.guardConfirmed(options);
    // Before the switch, not after: `appendRecord` creates the directory itself, so without this
    // the first failure lands at the first record, on whoever reads rather than whoever turned on.
    await this.sink.ensureWritable();
    this.logger.info(`AIDD telemetry switch -> ${switchPath}`);
    // The switch is written last, once everything it promises is in place: a failure partway
    // through must never leave `enabled: true` describing a setup that stopped short of it.
    await this.protectRunsDir(options.projectRoot);
    await this.makeCommitsJoinable(options.projectRoot);
    const switchChanged = await this.writeSwitch(switchPath);
    return { switchPath, switchChanged };
  }

  // `.aidd/config.json` is git-tracked, the consequence `endpoint --scope project` already
  // refuses without `--yes`. Fires unconditionally, whatever the switch's current state.
  private guardConfirmed(options: TelemetryOnOptions): void {
    if (options.confirmed) return;
    throw new TelemetryProjectScopeRequiresYesError(
      "aidd telemetry on",
      telemetryConfigPath(options.projectRoot)
    );
  }

  // Re-checked on every successful `on`, switch newly written or not: a project turned on before
  // this existed still gets the journal ignored, without turning telemetry off and on again.
  private async protectRunsDir(projectRoot: string): Promise<void> {
    const added = await this.gitignore.execute(projectRoot, [RUNS_ENTRY]);
    if (added) {
      this.logger.info(
        `Added ${RUNS_ENTRY} to .gitignore — the journal names no person, only the ` +
          "repository, the task folders written into, the skills run, and their timings. " +
          "Delete that line to commit it instead."
      );
    }
    const tracked = await this.git.listTrackedFiles(projectRoot, RUNS_ENTRY);
    if (tracked.length === 0) return;
    this.logger.warn(
      "Already tracked by git — the repository, the task folders written into, the skills " +
        `run, and their timings:\n${tracked.map((file) => `  ${file}`).join("\n")}\n` +
        "Nothing removed or rewritten — your call."
    );
  }

  /** Re-run on every successful `on`, switch newly written or not, for the same reason
   * `protectRunsDir` is. Announced rather than done quietly: it writes into commit messages a
   * team will read, so the sentence saying so and the command undoing it must be findable. */
  private async makeCommitsJoinable(projectRoot: string): Promise<void> {
    const install = await this.git.installCommitMessageDelegate(
      projectRoot,
      SESSION_TRAILER_DELEGATE_FILE,
      sessionTrailerDelegateScript()
    );
    if (install.hookManager !== undefined) {
      this.reportManagedHook(install.hookManager, install.managerCallsDelegate === true);
      return;
    }
    if (!install.lineAdded) return;
    this.logger.info(
      `Commits made by an AI session will carry an ${SESSION_TRAILER_TOKEN} trailer, so what ` +
        "a session cost can be read per commit. A commit no session made carries nothing. " +
        "`aidd telemetry off` removes it."
    );
  }

  /** `prepare-commit-msg` under a manager is committed, shared config this CLI may not append
   * to — an append would reach every clone through a commit nobody reviewed — and lefthook
   * regenerates it from that config anyway. A chain already wired prints nothing: the ordinary
   * trailer promise above already covers it. */
  private reportManagedHook(manager: HookManager, wired: boolean): void {
    if (wired) return;
    const { targetFile, snippet } = sessionTrailerManagerSnippet(
      manager,
      SESSION_TRAILER_DELEGATE_FILE
    );
    this.logger.info(
      `${manager} owns prepare-commit-msg here, so nothing was appended to it. Commits will ` +
        `not carry an ${SESSION_TRAILER_TOKEN} trailer until you ` +
        `${sessionTrailerManagerInstruction(manager, targetFile)}:\n\n${snippet}\n`
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

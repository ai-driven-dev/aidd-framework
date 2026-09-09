import type { TelemetryExportLeftover } from "../telemetry-export-leftover.js";
import type { TelemetryRecorderDeclarationSetup } from "../telemetry-setup.js";

/** The marker the journal hook writes when a payload arrived and matched no host this build
 * declares — read by name, never through the run journal reader, whose parser would leave it
 * indistinguishable from a torn run file. */
export interface TelemetryUnrecognisedPayload {
  readonly at: string;
}

/** The project's own switch file, read for what `isTelemetryEnabled`'s plain boolean cannot
 * carry: the file's own `enabled` value, and whether it could be read at all. Never folds in
 * the person's own refusal, which is a non-file fact the caller reads from `env` directly. */
export interface TelemetrySwitchSetupRead {
  readonly path: string;
  /** The file's own `enabled` value. Meaningless when `readable` is `false` — always `false`
   * there, the same "damaged reads as off" direction the gate itself takes. */
  readonly enabled: boolean;
  /** `true` for a file that is absent (nothing here is a person's choice yet) or that
   * parses as a valid switch. `false` only for a file that exists but could not be read or
   * parsed — a damaged file, not a choice. */
  readonly readable: boolean;
}

/**
 * The evidence `aidd telemetry check` and `aidd telemetry off` need beyond the run journal,
 * each tool's own local reader and Codex's hook trust, each of which has its own port:
 * whether the project switch is on, the unrecognised-payload marker, and whether a settings
 * file still carries a stale export configuration. A read that fails answers with the evidence
 * that says so (`false`/`null`/`[]`) and never throws, so one damaged file cannot cost every
 * other claim its verdict.
 */
export interface TelemetryEvidenceReader {
  /** `.aidd/config.json`'s `telemetry.enabled`, read the way the hook reads it — strict
   * `=== true`, so a half-written config counts as off. The person's own refusal
   * (`AIDD_TELEMETRY=0`) overrides it unconditionally. */
  isTelemetryEnabled(projectRoot: string, env: NodeJS.ProcessEnv): Promise<boolean>;

  readUnrecognisedPayload(projectRoot: string): Promise<TelemetryUnrecognisedPayload | null>;

  /** Every settings file this build knows how to check that still carries a key an export
   * endpoint used to write — detection only. Empty is not proof one was never configured:
   * only the locations this build knows to look at are checked. */
  findLeftoverExportConfig(projectRoot: string): Promise<readonly TelemetryExportLeftover[]>;

  /** The project's switch file itself — see `TelemetrySwitchSetupRead` for why this is
   * separate from `isTelemetryEnabled`. */
  readSwitchSetup(projectRoot: string): Promise<TelemetrySwitchSetupRead>;

  /** Whether the recorder is declared anywhere this build knows to check — the AIDD manifest
   * and a tool's own settings file. Never throws: a manifest or settings file that cannot be
   * parsed reads as "not declared there". */
  readRecorderDeclaration(projectRoot: string): Promise<TelemetryRecorderDeclarationSetup>;
}

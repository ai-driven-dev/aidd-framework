import type { MergeStrategy } from "../models/merge.js";
import type { TelemetrySessionMeasure } from "../models/telemetry-sink-record.js";

/**
 * Where the enabled export lands, and who is affected:
 * - `local`   — machine-local, not git-tracked (default)
 * - `project` — git-tracked, everyone who clones the project inherits it
 * - `user`    — this machine, every project
 */
export const TELEMETRY_SCOPES = ["local", "project", "user"] as const;
export type TelemetryScope = (typeof TELEMETRY_SCOPES)[number];
export const DEFAULT_TELEMETRY_SCOPE: TelemetryScope = "local";

/** The tool writes telemetry config into a settings file AIDD merges into, so `aidd clean`
 * can undo it. `resolveSettingsPath` and `buildEnv` are pure, keeping the calling use-case
 * free of I/O and of this tool's on-disk shape. `trackedScopes` names the scopes that write
 * a git-tracked file, which need `--yes`. */
export interface TelemetrySettingsFileActivation {
  readonly kind: "settings-file";
  readonly sectionKey: string;
  readonly mergeStrategy: MergeStrategy;
  readonly scopes: readonly TelemetryScope[];
  readonly defaultScope: TelemetryScope;
  readonly trackedScopes: readonly TelemetryScope[];
  resolveSettingsPath(scope: TelemetryScope, projectRoot: string, homeDir: string): string;
  buildEnv(endpoint: string | undefined, projectId: string): Readonly<Record<string, string>>;
  /** Printed once, after a successful write — a caveat specific to this tool's export. */
  readonly postEnableNotice?: string;
}

/** The tool reads an environment variable AIDD does not, and will not, set on the user's
 * behalf — exporting env vars into someone's shell is out of scope for a project-local CLI. */
export interface TelemetryEnvironmentVariableActivation {
  readonly kind: "environment-variable";
  readonly variable: string;
  readonly value: string;
}

/** AIDD has no writer for this tool's telemetry config yet. */
export interface TelemetryPlannedActivation {
  readonly kind: "planned";
  readonly trackedIn: string;
}

/** Enabling this tool's telemetry requires an action AIDD cannot perform (a dashboard
 * toggle, a plan tier, ...). */
export interface TelemetryExternalActivation {
  readonly kind: "external";
  readonly reason: string;
  readonly remedy: string;
}

export type TelemetryActivation =
  | TelemetrySettingsFileActivation
  | TelemetryEnvironmentVariableActivation
  | TelemetryPlannedActivation
  | TelemetryExternalActivation;

/** What a tool's OTLP export carries, measured by hand one session per tool, never taken
 * from documentation. The sink mapper reads this and nothing else to resolve which tool
 * sent a payload; it never branches on `toolId`. */
export interface TelemetryExportDeclared {
  readonly kind: "declared";
  readonly identityAttribute: string;
  readonly turnAttribute?: string;
  readonly sessionMeasures?: readonly TelemetrySessionMeasure[];
}

/** No session has been captured for this tool's export yet — declared rather than guessed. */
export interface TelemetryExportUnmeasured {
  readonly kind: "unmeasured";
}

export type TelemetryExport = TelemetryExportDeclared | TelemetryExportUnmeasured;

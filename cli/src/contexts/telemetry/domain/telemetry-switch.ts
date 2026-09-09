import { join } from "node:path";
import { AIDD_CONFIG_FILENAME, AIDD_DIR } from "../../../kernel/paths.js";

/** `.aidd/config.json`'s `telemetry` key, the one answer to "is AIDD allowed to measure this
 * project", read fresh at every call. Absent or unparseable means off, the same failure
 * direction the journal hook's own read takes. */
export interface TelemetrySwitch {
  readonly enabled: boolean;
  /** A destination a since-removed `telemetry endpoint` command wrote here. Nothing reads it
   * as a destination any more; `on` and `off` preserve it verbatim so neither drops a key it
   * never wrote. A live export a tool still reads is `telemetry-export-leftover.ts`'s fact. */
  readonly endpoint?: string;
}

export function telemetryConfigPath(projectRoot: string): string {
  return join(projectRoot, AIDD_DIR, AIDD_CONFIG_FILENAME);
}

/** The refusal at a person's own scope: an environment variable, refusable per shell and per
 * machine, rather than a second file holding the same fact. Mirrors `repo.cjs`'s own predicate
 * so hook and CLI cannot disagree — only the literal `"0"` refuses, and unset is not a choice
 * this variable can express, so it never turns measurement on by itself. */
export const TELEMETRY_REFUSAL_VARIABLE = "AIDD_TELEMETRY";

export function personRefusesTelemetry(env: NodeJS.ProcessEnv): boolean {
  return env[TELEMETRY_REFUSAL_VARIABLE] === "0";
}

/** The person's refusal wins unconditionally; the project's tracked switch is read only when
 * it does not apply — the same order and verdict `repo.cjs` computes. */
export function resolveTelemetryEnabled(
  fileSwitch: TelemetrySwitch | null,
  env: NodeJS.ProcessEnv
): boolean {
  if (personRefusesTelemetry(env)) return false;
  return fileSwitch?.enabled === true;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeParse(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Unparseable content, or a `telemetry` key of the wrong shape, reads as `null` (off). */
export function parseTelemetrySwitchFile(content: string): TelemetrySwitch | null {
  const telemetry = asRecord(asRecord(safeParse(content))?.telemetry);
  if (telemetry === null) return null;
  const endpoint = typeof telemetry.endpoint === "string" ? telemetry.endpoint : undefined;
  return { enabled: telemetry.enabled === true, endpoint };
}

/** Upserts `telemetry`, leaving every other top-level key untouched: a key this function did
 * not add must survive both `on` and `off`. */
export function buildTelemetrySwitchFile(
  existingRaw: string | null,
  next: TelemetrySwitch
): string {
  const root = (existingRaw !== null ? asRecord(safeParse(existingRaw)) : null) ?? {};
  root.telemetry =
    next.endpoint !== undefined
      ? { enabled: next.enabled, endpoint: next.endpoint }
      : { enabled: next.enabled };
  return `${JSON.stringify(root, null, 2)}\n`;
}

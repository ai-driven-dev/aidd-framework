import { join } from "node:path";
import { AIDD_CONFIG_FILENAME, AIDD_DIR } from "../../../kernel/paths.js";

/**
 * `.aidd/config.json`'s `telemetry` key — the one answer to "is AIDD allowed to measure
 * this project", read fresh at every call by the journal hook, the sink, the diagnostic,
 * and the report. Absent or unparseable means off, mirrored here from the hook's own
 * `readTelemetryConfig` + `telemetryEnabled` failure direction.
 */
export interface TelemetrySwitch {
  readonly enabled: boolean;
  /** A destination `aidd telemetry endpoint` used to write here, before that command and
   * its targeted undo (`endpoint clear`) were both deleted in "one route, and every
   * sentence about it true". Nothing in this system sets, clears, or reads this value as a
   * destination any more — `on` and `off` both preserve it verbatim, purely so neither
   * silently drops a key it never wrote. A settings file a tool itself still reads for a
   * real, live export is a different fact this field cannot see — see
   * `telemetry-export-leftover.ts` for what detects that. */
  readonly endpoint?: string;
}

export function telemetryConfigPath(projectRoot: string): string {
  return join(projectRoot, AIDD_DIR, AIDD_CONFIG_FILENAME);
}

/** The only refusal available at a person's own scope. Not a second config file: state for
 * "is this measured" already lives in `.aidd/config.json` (the project's tracked decision),
 * and a file at the person's scope would be a third place the same fact could live, in a
 * change whose point is that there are too many already. An environment variable is
 * refusable per shell, per session and per machine, and needs nothing to be created.
 *
 * Mirrors `plugins/aidd-telemetry/hooks/lib/repo.cjs`'s `personRefusesTelemetry` exactly -
 * same variable name, same predicate - so the hook and the CLI can never disagree about
 * whether a person has refused. Only the literal string `"0"` counts as a refusal: unset or
 * empty is not a choice this variable can express, and never turns measurement on by
 * itself. */
export const TELEMETRY_REFUSAL_VARIABLE = "AIDD_TELEMETRY";

export function personRefusesTelemetry(env: NodeJS.ProcessEnv): boolean {
  return env[TELEMETRY_REFUSAL_VARIABLE] === "0";
}

/** Whether measurement is on, from the CLI's side: the person's own refusal read first and
 * winning unconditionally, the project's tracked switch read only when it does not apply -
 * the same order and the same verdict `telemetryEnabled` in `repo.cjs` computes. */
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

/** Unreadable, unparseable, or a `telemetry` key with the wrong shape all read as `null`
 * (off) — never throws, same failure direction as everywhere else in this layer. */
export function parseTelemetrySwitchFile(content: string): TelemetrySwitch | null {
  const telemetry = asRecord(asRecord(safeParse(content))?.telemetry);
  if (telemetry === null) return null;
  const endpoint = typeof telemetry.endpoint === "string" ? telemetry.endpoint : undefined;
  return { enabled: telemetry.enabled === true, endpoint };
}

/** Upserts `telemetry` into whatever JSON already lives at the switch path, leaving every
 * other top-level key untouched. The switch shares `.aidd/config.json` with nothing else
 * today, but a key this function did not add must survive both `on` and `off` regardless. */
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

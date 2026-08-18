import { join } from "node:path";
import { AIDD_CONFIG_FILENAME, AIDD_DIR } from "./paths.js";

/**
 * `.aidd/config.json`'s `telemetry` key — the one answer to "is AIDD allowed to measure
 * this project", read fresh at every call by the journal hook, the sink, the diagnostic,
 * and the report. Absent or unparseable means off, mirrored here from the hook's own
 * `readTelemetryConfig` + `telemetryEnabled` failure direction.
 */
export interface TelemetrySwitch {
  readonly enabled: boolean;
  readonly endpoint?: string;
}

export function telemetryConfigPath(projectRoot: string): string {
  return join(projectRoot, AIDD_DIR, AIDD_CONFIG_FILENAME);
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

/** Shape-only check, called before ever writing the switch: an invalid endpoint must fail
 * the same way a missing one does — nothing written, not even localhost as a fallback. */
export function isValidTelemetryEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

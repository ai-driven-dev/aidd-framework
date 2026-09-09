import { asPlainObject } from "../../../kernel/reading/plain-object.js";

/** The `env` keys a since-removed `telemetry endpoint` command wrote into a Claude Code
 * settings file. Detection only: nothing in this system writes them any more, and a settings
 * file still carrying them keeps exporting, so naming them is the only remedy left. */
export const CLAUDE_TELEMETRY_EXPORT_ENV_KEYS = [
  "CLAUDE_CODE_ENABLE_TELEMETRY",
  "OTEL_METRICS_EXPORTER",
  "OTEL_LOGS_EXPORTER",
  "OTEL_EXPORTER_OTLP_PROTOCOL",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_METRIC_EXPORT_INTERVAL",
  "OTEL_RESOURCE_ATTRIBUTES",
] as const;

/** One settings file and which of the keys it carries, so exactly those can be removed rather
 * than the whole `env` block. */
export interface TelemetryExportLeftover {
  readonly path: string;
  readonly keys: readonly string[];
}

/** Never throws: an absent or malformed file has no keys this can find, which is not the same
 * claim as "clean" but is the only one available here. */
export function findLeftoverExportKeys(content: string | null): readonly string[] {
  if (content === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const env = asPlainObject(asPlainObject(parsed)?.env);
  if (env === null) return [];
  return CLAUDE_TELEMETRY_EXPORT_ENV_KEYS.filter((key) => key in env);
}

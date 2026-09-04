import { asPlainObject } from "../../../kernel/reading/plain-object.js";

/**
 * The exact `env` keys `aidd telemetry endpoint` used to write into a Claude Code settings
 * file, back when that command — and its targeted undo, `endpoint clear` — still existed.
 * Detection only: nothing here builds this shape or writes it anywhere, and nothing in this
 * system can any more (see "one route, and every sentence about it true", which deleted the
 * writer on purpose). A settings file that still carries any of these keeps exporting
 * whatever it always did; naming them is the only remedy left.
 */
export const CLAUDE_TELEMETRY_EXPORT_ENV_KEYS = [
  "CLAUDE_CODE_ENABLE_TELEMETRY",
  "OTEL_METRICS_EXPORTER",
  "OTEL_LOGS_EXPORTER",
  "OTEL_EXPORTER_OTLP_PROTOCOL",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_METRIC_EXPORT_INTERVAL",
  "OTEL_RESOURCE_ATTRIBUTES",
] as const;

/** One settings file that still carries at least one of the keys above, and which of them —
 * so a person reading this is told what is set, in which file, and can remove exactly those
 * keys rather than guessing at the whole `env` block. */
export interface TelemetryExportLeftover {
  readonly path: string;
  readonly keys: readonly string[];
}

/** Which of the known export keys sit in a settings file's `env` block, given its raw
 * content — `null` for a file that does not exist, the same "absent reads as nothing found"
 * rule every other reader in this layer follows. Never throws: an unreadable or malformed
 * file has no keys this can find in it, which is not the same claim as "definitely clean"
 * but is the only one this function is in a position to make. */
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

import { join } from "node:path";
import type { TelemetryScope } from "../../capabilities/telemetry-capability.js";
import { MissingTelemetryEndpointError } from "../../errors.js";
import type { TelemetrySessionMeasure } from "../../models/telemetry-sink-record.js";

/** Measured on real sessions: `session.id` on both metrics and events, `prompt.id` per
 * turn on `api_request`. */
export const CLAUDE_TELEMETRY_IDENTITY_ATTRIBUTE = "session.id";
export const CLAUDE_TELEMETRY_TURN_ATTRIBUTE = "prompt.id";

/** `claude_code.token.usage` reports all four token counts under one metric name,
 * distinguished only by the `type` attribute. */
export const CLAUDE_TELEMETRY_SESSION_MEASURES: readonly TelemetrySessionMeasure[] = [
  { metric: "claude_code.cost.usage", field: "cost_usd" },
  { metric: "claude_code.active_time.total", field: "active_time_s" },
  {
    metric: "claude_code.token.usage",
    field: "input_tokens",
    whenAttribute: "type",
    whenValue: "input",
  },
  {
    metric: "claude_code.token.usage",
    field: "output_tokens",
    whenAttribute: "type",
    whenValue: "output",
  },
  {
    metric: "claude_code.token.usage",
    field: "cache_read_tokens",
    whenAttribute: "type",
    whenValue: "cacheRead",
  },
  {
    metric: "claude_code.token.usage",
    field: "cache_creation_tokens",
    whenAttribute: "type",
    whenValue: "cacheCreation",
  },
];

/** Well under the 60s default: a session shorter than a minute must still flush. */
export const TELEMETRY_METRIC_EXPORT_INTERVAL_MS = "10000";

// Named so `aidd telemetry check`'s export-config reader can look for the same two keys
// this writer sets, rather than a second copy of the literal strings.
export const CLAUDE_TELEMETRY_ENABLE_KEY = "CLAUDE_CODE_ENABLE_TELEMETRY";
export const CLAUDE_TELEMETRY_ENABLE_VALUE = "1";
export const CLAUDE_TELEMETRY_ENDPOINT_KEY = "OTEL_EXPORTER_OTLP_ENDPOINT";

const CLAUDE_PROJECT_RELATIVE_SETTINGS_PATH: Record<Exclude<TelemetryScope, "user">, string> = {
  local: ".claude/settings.local.json",
  project: ".claude/settings.json",
};

// The skill name on `skill_activated` comes only with OTEL_LOG_TOOL_DETAILS, which also
// logs every Bash command line, MCP tool name, and tool input.
export const CLAUDE_TELEMETRY_POST_ENABLE_NOTICE =
  "Per-step cost comes from the run journal, not from this export. OTEL_LOG_TOOL_DETAILS " +
  "is not set — no Bash command, MCP tool name, or tool input is logged.";

/** The `env` block Claude Code needs to emit OTLP metrics and logs. An absent endpoint is
 * a caller error: there is no default, not even localhost. */
export function buildClaudeTelemetryEnv(
  endpoint: string | undefined,
  projectId: string
): Readonly<Record<string, string>> {
  const trimmedEndpoint = endpoint?.trim();
  if (!trimmedEndpoint) throw new MissingTelemetryEndpointError();
  return {
    [CLAUDE_TELEMETRY_ENABLE_KEY]: CLAUDE_TELEMETRY_ENABLE_VALUE,
    OTEL_METRICS_EXPORTER: "otlp",
    OTEL_LOGS_EXPORTER: "otlp",
    OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
    [CLAUDE_TELEMETRY_ENDPOINT_KEY]: trimmedEndpoint,
    OTEL_METRIC_EXPORT_INTERVAL: TELEMETRY_METRIC_EXPORT_INTERVAL_MS,
    OTEL_RESOURCE_ATTRIBUTES: `aidd.project_id=${projectId}`,
  };
}

export function resolveClaudeTelemetrySettingsPath(
  scope: TelemetryScope,
  projectRoot: string,
  homeDir: string
): string {
  if (scope === "user") return join(homeDir, ".claude", "settings.json");
  return join(projectRoot, CLAUDE_PROJECT_RELATIVE_SETTINGS_PATH[scope]);
}

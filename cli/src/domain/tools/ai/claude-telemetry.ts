import { join } from "node:path";
import type { TelemetryScope } from "../../capabilities/telemetry-capability.js";
import { MissingTelemetryEndpointError } from "../../errors.js";

/** Well under the 60s default: a session shorter than a minute must still flush. */
export const TELEMETRY_METRIC_EXPORT_INTERVAL_MS = "10000";

const CLAUDE_PROJECT_RELATIVE_SETTINGS_PATH: Record<Exclude<TelemetryScope, "user">, string> = {
  local: ".claude/settings.local.json",
  project: ".claude/settings.json",
};

// Per-step cost needs the real skill name on skill_activated, which only
// OTEL_LOG_TOOL_DETAILS provides — and that flag also logs every Bash command line,
// MCP tool name, and tool input. #663 removes the need instead of trading privacy for
// it; until then this is said out loud rather than left for a user to discover later.
export const CLAUDE_TELEMETRY_POST_ENABLE_NOTICE =
  "Per-step cost is unavailable until #663 lands. OTEL_LOG_TOOL_DETAILS is not set — " +
  "no Bash command, MCP tool name, or tool input is logged.";

/**
 * The exact `env` block Claude Code needs to emit OTLP metrics and logs.
 *
 * Pure function of its inputs — never reads `.aidd/config.json` or any other file to
 * discover the endpoint. Absent endpoint is a caller error: there is no default, not
 * even localhost. `OTEL_LOG_TOOL_DETAILS` is deliberately never set here — see
 * {@link CLAUDE_TELEMETRY_POST_ENABLE_NOTICE} for why.
 */
export function buildClaudeTelemetryEnv(
  endpoint: string | undefined,
  projectId: string
): Readonly<Record<string, string>> {
  const trimmedEndpoint = endpoint?.trim();
  if (!trimmedEndpoint) throw new MissingTelemetryEndpointError();
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: "1",
    OTEL_METRICS_EXPORTER: "otlp",
    OTEL_LOGS_EXPORTER: "otlp",
    OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
    OTEL_EXPORTER_OTLP_ENDPOINT: trimmedEndpoint,
    OTEL_METRIC_EXPORT_INTERVAL: TELEMETRY_METRIC_EXPORT_INTERVAL_MS,
    OTEL_RESOURCE_ATTRIBUTES: `aidd.project_id=${projectId}`,
  };
}

/** Resolves `scope` to the absolute settings file Claude Code reads for it. */
export function resolveClaudeTelemetrySettingsPath(
  scope: TelemetryScope,
  projectRoot: string,
  homeDir: string
): string {
  if (scope === "user") return join(homeDir, ".claude", "settings.json");
  return join(projectRoot, CLAUDE_PROJECT_RELATIVE_SETTINGS_PATH[scope]);
}

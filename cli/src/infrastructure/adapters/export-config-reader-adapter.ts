import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AiToolId } from "../../domain/models/tool-ids.js";
import type { ExportConfig, ExportConfigReader } from "../../domain/ports/export-config-reader.js";
import {
  CLAUDE_TELEMETRY_ENABLE_KEY,
  CLAUDE_TELEMETRY_ENABLE_VALUE,
  CLAUDE_TELEMETRY_ENDPOINT_KEY,
} from "../../domain/tools/ai/claude-telemetry.js";

// Never written by AIDD's own installer — `buildClaudeTelemetryEnv` sets no such key.
// Reading it is reading a person's own manual addition: the one case that matters by
// name, the setting that survives identity resolution
// (`telemetry-sink-record.ts`'s `resolveIdentity`) failing without ever leaving a trace in
// the sink — the dropped record is never stored, so this is the only place that fault is
// legible.
const CLAUDE_INCLUDE_SESSION_ID_KEY = "OTEL_METRICS_INCLUDE_SESSION_ID";
const CLAUDE_INCLUDE_SESSION_ID_DISABLED = "false";

interface EnvBlock {
  readonly filePath: string;
  readonly env: Record<string, unknown>;
}

function claudeSettingsPaths(projectRoot: string, homeDir: string): readonly string[] {
  return [
    join(projectRoot, ".claude", "settings.local.json"),
    join(projectRoot, ".claude", "settings.json"),
    join(homeDir, ".claude", "settings.json"),
  ];
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// A missing file, an unreadable one, and one with no `env` object at all all read the same
// way here: nothing to check in this file, never a reason to guess at what it would have
// said.
async function readEnvBlock(filePath: string): Promise<Record<string, unknown> | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
  const env = asObject(parsed)?.env;
  return asObject(env);
}

function hasEnableFlag(env: Record<string, unknown>): boolean {
  return env[CLAUDE_TELEMETRY_ENABLE_KEY] === CLAUDE_TELEMETRY_ENABLE_VALUE;
}

function hasEndpoint(env: Record<string, unknown>): boolean {
  const value = env[CLAUDE_TELEMETRY_ENDPOINT_KEY];
  return typeof value === "string" && value !== "";
}

// Names only the key(s) actually absent, across every block read — never both
// unconditionally, or a person with the endpoint set and only the enable flag missing
// would be sent to check a setting that was already right.
function missingClaudeSettingDetail(
  blocks: readonly EnvBlock[],
  checked: readonly string[]
): string {
  const enableSeen = blocks.some((block) => hasEnableFlag(block.env));
  const endpointSeen = blocks.some((block) => hasEndpoint(block.env));
  const checkedList = checked.join(", ");
  if (!enableSeen && !endpointSeen) {
    return `${CLAUDE_TELEMETRY_ENABLE_KEY}=${CLAUDE_TELEMETRY_ENABLE_VALUE} and ${CLAUDE_TELEMETRY_ENDPOINT_KEY} are not set, across ${checkedList}`;
  }
  if (!enableSeen)
    return `${CLAUDE_TELEMETRY_ENABLE_KEY}=${CLAUDE_TELEMETRY_ENABLE_VALUE} is not set, across ${checkedList}`;
  if (!endpointSeen) return `${CLAUDE_TELEMETRY_ENDPOINT_KEY} is not set, across ${checkedList}`;
  // Both keys exist, but never together in the one block a real install writes them into.
  // Named only for exactly what was read — never for whether Claude Code itself would
  // still merge them across scopes at its own runtime, which was never measured here.
  const enableAt = blocks.find((block) => hasEnableFlag(block.env))?.filePath;
  const endpointAt = blocks.find((block) => hasEndpoint(block.env))?.filePath;
  return (
    `${CLAUDE_TELEMETRY_ENABLE_KEY} is set in ${enableAt}, ${CLAUDE_TELEMETRY_ENDPOINT_KEY} in ${endpointAt} - ` +
    "not together in the one file an install writes them into; whether Claude Code merges " +
    "them across scopes was not measured here"
  );
}

function claudeConfiguredResult(
  blocks: readonly EnvBlock[],
  checked: readonly string[]
): Pick<ExportConfig, "configured" | "configuredDetail" | "missingDetail"> {
  const configuredAt = blocks.find((block) => hasEnableFlag(block.env) && hasEndpoint(block.env));
  if (configuredAt === undefined) {
    return { configured: false, missingDetail: missingClaudeSettingDetail(blocks, checked) };
  }
  return {
    configured: true,
    configuredDetail: `OTLP to ${String(configuredAt.env[CLAUDE_TELEMETRY_ENDPOINT_KEY])} (${configuredAt.filePath})`,
  };
}

function claudeIdentityResult(
  blocks: readonly EnvBlock[]
): Pick<ExportConfig, "identityDisabled" | "identityDisabledDetail"> {
  const disabledAt = blocks.find(
    (block) => block.env[CLAUDE_INCLUDE_SESSION_ID_KEY] === CLAUDE_INCLUDE_SESSION_ID_DISABLED
  );
  if (disabledAt === undefined) return { identityDisabled: false };
  return {
    identityDisabled: true,
    identityDisabledDetail: `${CLAUDE_INCLUDE_SESSION_ID_KEY}=${CLAUDE_INCLUDE_SESSION_ID_DISABLED} in ${disabledAt.filePath} strips the identifier from every metric datapoint and event record it exports`,
  };
}

async function readClaudeExportConfig(projectRoot: string, homeDir: string): Promise<ExportConfig> {
  const checked = claudeSettingsPaths(projectRoot, homeDir);
  const read = await Promise.all(checked.map((filePath) => readEnvBlock(filePath)));
  const blocks: EnvBlock[] = checked
    .map((filePath, index) => ({ filePath, env: read[index] }))
    .filter((entry): entry is EnvBlock => entry.env !== null);
  return { checked, ...claudeConfiguredResult(blocks, checked), ...claudeIdentityResult(blocks) };
}

// Codex's own config.toml, line-scanned the same way the hook-trust reader reads its trust
// state: config.toml carries arbitrary nested tables this adapter has no business parsing,
// and the one shape needed — an `[otel]` table's `metrics_exporter` key — is a plain
// string match, not a parser, and never guesses past what the file actually says.
const CODEX_DEFAULT_EXPORTER = "statsig";
const CODEX_OTEL_HEADER = "[otel]";
const CODEX_METRICS_EXPORTER_KEY = /^metrics_exporter\s*=\s*"([^"]*)"/u;

function codexConfigPath(homeDir: string): string {
  return join(homeDir, ".codex", "config.toml");
}

function findMetricsExporter(content: string): string | null {
  const lines = content.split("\n");
  const otelAt = lines.findIndex((line) => line.trim() === CODEX_OTEL_HEADER);
  if (otelAt === -1) return null;
  for (let i = otelAt + 1; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (line.startsWith("[")) break;
    const match = CODEX_METRICS_EXPORTER_KEY.exec(line);
    if (match?.[1] !== undefined) return match[1];
  }
  return null;
}

function codexMissingDetail(exporter: string | null, configPath: string): string {
  return exporter === null
    ? `no [otel] table in ${configPath} - metrics_exporter defaults to "${CODEX_DEFAULT_EXPORTER}"`
    : `[otel] metrics_exporter is still "${CODEX_DEFAULT_EXPORTER}", the default, in ${configPath}`;
}

async function readCodexExportConfig(homeDir: string): Promise<ExportConfig> {
  const configPath = codexConfigPath(homeDir);
  const checked = [configPath];
  let content: string;
  try {
    content = await readFile(configPath, "utf8");
  } catch {
    return {
      checked,
      configured: false,
      missingDetail: `no [otel] table in ${configPath} - metrics_exporter defaults to "${CODEX_DEFAULT_EXPORTER}"`,
      // Never measured: no Codex setting is known to strip conversation.id from its own
      // export, so there is no disabling flag to read here.
      identityDisabled: false,
    };
  }
  const exporter = findMetricsExporter(content);
  const configured = exporter !== null && exporter !== "" && exporter !== CODEX_DEFAULT_EXPORTER;
  return {
    checked,
    configured,
    // Only the exporter choice is checked, never its destination: no key naming an OTLP
    // endpoint under Codex's own `[otel]` table has ever been measured in this codebase.
    configuredDetail: configured
      ? `otel.metrics_exporter="${String(exporter)}" in ${configPath} - destination not checked, no endpoint key measured for Codex`
      : undefined,
    missingDetail: configured ? undefined : codexMissingDetail(exporter, configPath),
    identityDisabled: false,
  };
}

/** Only Claude Code and Codex are read here: `resolveCurrentTool` only ever names one of
 * these two, the same two variables measured live (see `session-anchor.ts`). A tool this
 * cannot name is a tool this adapter has nothing to check — the same "measured, not
 * assumed" rule the anchor itself follows. */
export class ExportConfigReaderAdapter implements ExportConfigReader {
  async read(
    tool: AiToolId | undefined,
    projectRoot: string,
    homeDir: string
  ): Promise<ExportConfig | null> {
    if (tool === "claude") return readClaudeExportConfig(projectRoot, homeDir);
    if (tool === "codex") return readCodexExportConfig(homeDir);
    return null;
  }
}

// What each tool's own on-disk configuration says about whether its OTLP export can run for
// the session being checked, and whether the setting that would strip the identifier a
// record gets joined on is present - read the way each tool's own export actually gets
// configured, never inferred from whether any exported data has shown up yet.
//
// Only Claude Code and Codex are read here: resolveCurrentTool (session-anchor.js) only ever
// names one of these two, the same two variables measurements.md records as actually probed
// live. A tool this file cannot name is a tool this file has nothing to check - the same
// "measured, not assumed" rule the anchor itself follows, and the reason there is no third
// branch here rather than a `default: unsupported` one that could never run.
//
// Both readers return the same shape, so diagnose.js's two claims never branch on which tool
// produced it:
//   { checked, configured, configuredDetail, missingDetail, identityDisabled, identityDisabledDetail }

const fs = require("node:fs");
const path = require("node:path");

// The exact env-block keys AIDD's own settings-file writer sets for Claude Code
// (buildClaudeTelemetryEnv, cli/src/domain/tools/ai/claude-telemetry.ts) - duplicated rather
// than imported: this script ships inside a skill, installed independently of the CLI's
// TypeScript build, and has to bring everything it needs itself, the same rule hook-trust.js
// and sink.js already state for their own hardcoded facts.
const CLAUDE_ENABLE_KEY = "CLAUDE_CODE_ENABLE_TELEMETRY";
const CLAUDE_ENABLE_VALUE = "1";
const CLAUDE_ENDPOINT_KEY = "OTEL_EXPORTER_OTLP_ENDPOINT";
// Never written by AIDD's own installer - buildClaudeTelemetryEnv sets no such key. Reading
// it is reading a person's own manual addition: the OTEL_METRICS_INCLUDE_SESSION_ID=false
// case #617 names by name, the one setting that survives identity resolution
// (telemetry-sink-record.ts's resolveIdentity) failing without ever leaving a trace in the
// sink - the dropped record is never stored, so this is the only place that fault is legible.
const CLAUDE_INCLUDE_SESSION_ID_KEY = "OTEL_METRICS_INCLUDE_SESSION_ID";
const CLAUDE_INCLUDE_SESSION_ID_DISABLED = "false";

function claudeSettingsPaths(projectRoot, homeDir) {
  return [
    path.join(projectRoot, ".claude", "settings.local.json"),
    path.join(projectRoot, ".claude", "settings.json"),
    path.join(homeDir, ".claude", "settings.json"),
  ];
}

// A missing file, an unreadable one, and one with no `env` object at all all read the same
// way here: nothing to check in this file, never a reason to guess at what it would have
// said.
function readEnvBlock(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
  return parsed && typeof parsed.env === "object" && parsed.env !== null ? parsed.env : null;
}

// Names only the key(s) actually absent, across every block read - never both unconditionally,
// or a person with the endpoint set and only the enable flag missing would be sent to check a
// setting that was already right.
function missingClaudeSettingDetail(blocks, checked, hasEnable, hasEndpoint) {
  if (!hasEnable && !hasEndpoint) {
    return `${CLAUDE_ENABLE_KEY}=${CLAUDE_ENABLE_VALUE} and ${CLAUDE_ENDPOINT_KEY} are not set, across ${checked.join(", ")}`;
  }
  if (!hasEnable) return `${CLAUDE_ENABLE_KEY}=${CLAUDE_ENABLE_VALUE} is not set, across ${checked.join(", ")}`;
  if (!hasEndpoint) return `${CLAUDE_ENDPOINT_KEY} is not set, across ${checked.join(", ")}`;
  // Both keys exist, but never together in the one block a real install writes them into -
  // buildClaudeTelemetryEnv (claude-telemetry.ts) builds the whole env block at once and
  // AIDD's own writer puts it in a single settings file, so this shape (each half in a
  // different file) is not one this repository's own installer produces. Named only for
  // exactly what was read - the two paths - never for whether Claude Code itself would still
  // merge them across scopes at its own runtime, which was never measured here.
  const enableAt = blocks.find((b) => b.env[CLAUDE_ENABLE_KEY] === CLAUDE_ENABLE_VALUE).filePath;
  const endpointAt = blocks.find(
    (b) => typeof b.env[CLAUDE_ENDPOINT_KEY] === "string" && b.env[CLAUDE_ENDPOINT_KEY] !== ""
  ).filePath;
  return (
    `${CLAUDE_ENABLE_KEY} is set in ${enableAt}, ${CLAUDE_ENDPOINT_KEY} in ${endpointAt} - ` +
    "not together in the one file an install writes them into; whether Claude Code merges " +
    "them across scopes was not measured here"
  );
}

function readClaudeExportConfig(projectRoot, homeDir) {
  const checked = claudeSettingsPaths(projectRoot, homeDir);
  const blocks = checked
    .map((filePath) => ({ filePath, env: readEnvBlock(filePath) }))
    .filter((entry) => entry.env !== null);
  const configuredAt = blocks.find(
    (b) =>
      b.env[CLAUDE_ENABLE_KEY] === CLAUDE_ENABLE_VALUE &&
      typeof b.env[CLAUDE_ENDPOINT_KEY] === "string" &&
      b.env[CLAUDE_ENDPOINT_KEY] !== ""
  );
  const disabledAt = blocks.find((b) => b.env[CLAUDE_INCLUDE_SESSION_ID_KEY] === CLAUDE_INCLUDE_SESSION_ID_DISABLED);
  const hasEnable = blocks.some((b) => b.env[CLAUDE_ENABLE_KEY] === CLAUDE_ENABLE_VALUE);
  const hasEndpoint = blocks.some(
    (b) => typeof b.env[CLAUDE_ENDPOINT_KEY] === "string" && b.env[CLAUDE_ENDPOINT_KEY] !== ""
  );
  return {
    checked,
    configured: Boolean(configuredAt),
    configuredDetail: configuredAt
      ? `OTLP to ${configuredAt.env[CLAUDE_ENDPOINT_KEY]} (${configuredAt.filePath})`
      : undefined,
    missingDetail: configuredAt ? undefined : missingClaudeSettingDetail(blocks, checked, hasEnable, hasEndpoint),
    identityDisabled: Boolean(disabledAt),
    identityDisabledDetail: disabledAt
      ? `${CLAUDE_INCLUDE_SESSION_ID_KEY}=${CLAUDE_INCLUDE_SESSION_ID_DISABLED} in ${disabledAt.filePath} strips the identifier from every metric datapoint and event record it exports`
      : undefined,
  };
}

// Codex's own config.toml, line-scanned the same way hook-trust.js reads its trust state:
// config.toml carries arbitrary nested tables this script has no business parsing, and the
// one shape needed - an `[otel]` table's `metrics_exporter` key - is a plain string match,
// not a parser, and never guesses past what the file actually says.
const CODEX_DEFAULT_EXPORTER = "statsig";
const CODEX_OTEL_HEADER = "[otel]";
const CODEX_METRICS_EXPORTER_KEY = /^metrics_exporter\s*=\s*"([^"]*)"/u;

function codexConfigPath(homeDir) {
  return path.join(homeDir, ".codex", "config.toml");
}

function findMetricsExporter(content) {
  const lines = content.split("\n");
  const otelAt = lines.findIndex((line) => line.trim() === CODEX_OTEL_HEADER);
  if (otelAt === -1) return null;
  for (let i = otelAt + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("[")) break;
    const match = line.match(CODEX_METRICS_EXPORTER_KEY);
    if (match) return match[1];
  }
  return null;
}

function readCodexExportConfig(homeDir) {
  const configPath = codexConfigPath(homeDir);
  const checked = [configPath];
  let content;
  try {
    content = fs.readFileSync(configPath, "utf8");
  } catch {
    return {
      checked,
      configured: false,
      missingDetail: `no [otel] table in ${configPath} - metrics_exporter defaults to "${CODEX_DEFAULT_EXPORTER}"`,
      // Never measured: no Codex setting is known to strip conversation.id from its own
      // export, so there is no disabling flag to read here - a different fact from
      // "unmeasured", this route simply carries no such override to check.
      identityDisabled: false,
    };
  }
  const exporter = findMetricsExporter(content);
  const configured = exporter !== null && exporter !== "" && exporter !== CODEX_DEFAULT_EXPORTER;
  return {
    checked,
    configured,
    // Only the exporter choice is checked, never its destination: no key naming an OTLP
    // endpoint under Codex's own `[otel]` table has ever been measured in this codebase
    // (codex.ts's own comment names the hazard this leaves open - metrics_exporter set to
    // "otlp" still ships silently off-project if nothing else points it at the local sink).
    // Said here rather than left implicit, so `ok` is read for exactly what it checked.
    configuredDetail: configured
      ? `otel.metrics_exporter="${exporter}" in ${configPath} - destination not checked, no endpoint key measured for Codex`
      : undefined,
    missingDetail: configured
      ? undefined
      : exporter === null
        ? `no [otel] table in ${configPath} - metrics_exporter defaults to "${CODEX_DEFAULT_EXPORTER}"`
        : `[otel] metrics_exporter is still "${CODEX_DEFAULT_EXPORTER}", the default, in ${configPath}`,
    identityDisabled: false,
  };
}

function readExportConfig(currentTool, projectRoot, homeDir) {
  if (currentTool === "claude") return readClaudeExportConfig(projectRoot, homeDir);
  if (currentTool === "codex") return readCodexExportConfig(homeDir);
  return null;
}

module.exports = { readExportConfig, readClaudeExportConfig, readCodexExportConfig };

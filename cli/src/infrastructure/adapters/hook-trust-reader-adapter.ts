import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TelemetryCodexHookTrust } from "../../domain/models/telemetry-claim.js";
import type { HookTrustReader } from "../../domain/ports/hook-trust-reader.js";
import { resolveHomeDir } from "../home-dir.js";

// Mirrors the plugin's own PLUGIN_NAME/HOOKS_FILE/SESSION_START_EVENT constants
// (`hook-trust.cjs`) — the exact table header Codex writes to `~/.codex/config.toml` once
// a hook is approved. Only the SessionStart hook decides whether a journal opens at all —
// the claim this exists for — so that is the one event whose trust state actually explains
// an empty journal.
const PLUGIN_NAME = "aidd-telemetry";
const HOOKS_FILE = "hooks/hooks.json";
const SESSION_START_EVENT = "session_start";

function codexConfigPath(homeDir: string): string {
  return join(homeDir, ".codex", "config.toml");
}

// Line-scanned, not TOML-parsed — `config.toml` carries arbitrary nested tables and
// multi-line values this adapter has no business understanding. The one shape it needs is
// a header Codex itself always emits verbatim, directly followed by its `trusted_hash`
// line: a plain string match, mirroring the plugin's own `parseHookTrust`. Matched on the
// full key including the event name, so a hook approved under a renamed event — a
// different key entirely — is not found here and reads as untrusted, never as approved
// under its old name.
function parseHookTrust(content: string): { trusted: boolean } {
  const lines = content.split("\n");
  const prefix = `[hooks.state."${PLUGIN_NAME}@`;
  const suffix = `:${HOOKS_FILE}:${SESSION_START_EVENT}:0:0"]`;
  const at = lines.findIndex((line) => line.startsWith(prefix) && line.endsWith(suffix));
  if (at === -1) return { trusted: false };
  return { trusted: /^trusted_hash\s*=/.test((lines[at + 1] ?? "").trim()) };
}

// `hook-trust.cjs`'s own `error.code || error.message`: a filesystem failure's `code`
// (`ENOENT`, `EACCES`) is the concise, meaningful half - `.message` on the same error
// restates the path this sentence already names, which is the mismatch phase 5's
// confrontation caught once already for a sibling adapter's punctuation (measurements.md).
// Not `person-identity-adapter.ts`'s own `describeError`: that one describes a JSON parse
// error, which carries no `code` worth preferring, so it reads `.message` alone - a
// different error kind, not a duplicate of this one.
function describeError(error: unknown): string {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

export class HookTrustReaderAdapter implements HookTrustReader {
  async read(): Promise<TelemetryCodexHookTrust> {
    const configPath = codexConfigPath(resolveHomeDir());
    let content: string;
    try {
      content = await readFile(configPath, "utf8");
    } catch (error) {
      return {
        readable: false,
        reason: `${configPath} could not be read (${describeError(error)})`,
      };
    }
    return { readable: true, configPath, ...parseHookTrust(content) };
  }
}

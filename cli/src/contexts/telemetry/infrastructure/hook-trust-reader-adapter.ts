import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describeError } from "../../../kernel/describe-error.js";
import { resolveHomeDir } from "../../../kernel/reading/home-dir.js";
import type { HookTrustReader } from "../domain/ports/hook-trust-reader.js";
import type { TelemetryCodexHookTrust } from "../domain/telemetry-claim.js";

// The exact table header Codex writes to `~/.codex/config.toml` once a hook is approved. The
// plugin's own `hook-trust.cjs` is gone, so these live here alone: SessionStart is the one
// event whose trust state explains an empty journal, and the literal is exported so
// `telemetry-evidence-adapter.ts` checks it rather than a copy that could drift.
export const PLUGIN_NAME = "aidd-telemetry";
const HOOKS_FILE = "hooks/hooks.json";
const SESSION_START_EVENT = "session_start";

// The recorder's own hook entry point. Exported so a hooks block declared in a project's
// own settings is recognised by the script it invokes, not by a loose substring.
export const HOOK_ENTRY_SCRIPT = "journal.cjs";

function codexConfigPath(homeDir: string): string {
  return join(homeDir, ".codex", "config.toml");
}

// Line-scanned, not TOML-parsed: the one shape needed is a header Codex emits verbatim,
// directly followed by its `trusted_hash` line. Matched on the full key including the event
// name, so a hook approved under a renamed event reads as untrusted rather than approved.
function parseHookTrust(content: string): { trusted: boolean } {
  const lines = content.split("\n");
  const prefix = `[hooks.state."${PLUGIN_NAME}@`;
  const suffix = `:${HOOKS_FILE}:${SESSION_START_EVENT}:0:0"]`;
  const at = lines.findIndex((line) => line.startsWith(prefix) && line.endsWith(suffix));
  if (at === -1) return { trusted: false };
  return { trusted: /^trusted_hash\s*=/.test((lines[at + 1] ?? "").trim()) };
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

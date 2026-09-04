import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describeError } from "../../../kernel/describe-error.js";
import { resolveHomeDir } from "../../../kernel/reading/home-dir.js";
import type { HookTrustReader } from "../domain/ports/hook-trust-reader.js";
import type { TelemetryCodexHookTrust } from "../domain/telemetry-claim.js";

// The exact table header Codex writes to `~/.codex/config.toml` once a hook is approved.
// These came from the plugin's own PLUGIN_NAME/HOOKS_FILE/SESSION_START_EVENT constants
// (`hook-trust.cjs`), deleted when the CLI took the read path; they live here alone now,
// so there is no second copy to keep them in step with. Only the SessionStart hook decides whether a journal opens at all —
// the claim this exists for — so that is the one event whose trust state actually explains
// an empty journal.
//
// Exported so `telemetry-evidence-adapter.ts` can check the same literal for the recorder
// declaration fact, rather than a second copy that could drift from this one.
export const PLUGIN_NAME = "aidd-telemetry";
const HOOKS_FILE = "hooks/hooks.json";
const SESSION_START_EVENT = "session_start";

// The recorder's own hook entry point (`plugins/aidd-telemetry/hooks/hooks.json`'s
// `command` for every event it registers). Exported alongside `PLUGIN_NAME` so a hooks
// block found declared in a project's own settings — rather than via `enabledPlugins` —
// is recognised by the script it actually invokes, not a loose substring: a rename here
// is the one place `telemetry-evidence-adapter.ts`'s detection needs to follow.
export const HOOK_ENTRY_SCRIPT = "journal.cjs";

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

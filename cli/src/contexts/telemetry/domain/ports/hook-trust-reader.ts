import type { TelemetryCodexHookTrust } from "../telemetry-claim.js";

/**
 * Whether Codex trusts this plugin's hook, keyed in `~/.codex/config.toml` exactly on the
 * event name: a hook approved under a renamed event inherits no approval. `readable: false`
 * covers every fs failure and licenses no guess at trust in either direction.
 */
export interface HookTrustReader {
  read(): Promise<TelemetryCodexHookTrust>;
}

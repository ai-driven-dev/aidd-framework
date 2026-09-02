import type { TelemetryCodexHookTrust } from "../models/telemetry-claim.js";

/**
 * Whether Codex has trusted this plugin's hook, read the way Codex itself decides it — a
 * `[hooks.state."<plugin>@<marketplace>:hooks/hooks.json:<event>:0:0"]` table carrying a
 * `trusted_hash`, in `~/.codex/config.toml`. Trust is keyed per entry, exactly on that
 * event name: a hook approved under a renamed event inherits no approval, because the key
 * it would need to match no longer exists in the file at all — the same absence an
 * install that has simply never been approved leaves.
 *
 * `readable: false` covers everything short of the config file actually opening as text:
 * missing, unreadable, or any other fs failure. Neither direction licenses a guess at
 * trust — an unread state is not an absent one, and `aidd telemetry check`'s own
 * `hook-fired` claim falls back to its generic "never fired" reading rather than
 * pretending either way.
 */
export interface HookTrustReader {
  read(): Promise<TelemetryCodexHookTrust>;
}

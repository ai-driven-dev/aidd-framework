// ── Codex-native marketplace catalog (for `codex plugin marketplace add`) ──────
// Shape verified 2026-07-05 against https://github.com/openai/plugins
// .agents/plugins/marketplace.json and https://developers.openai.com/codex/plugins/build.

/** Default category when the source marketplace entry does not specify one. */
export const CODEX_DEFAULT_CATEGORY = "Developer Tools";
/**
 * Default per-plugin auth policy. AIDD plugins bundle skills/agents/hooks with no
 * external OAuth, so auth is deferred to first use rather than forced at install.
 */
export const CODEX_DEFAULT_AUTHENTICATION = "ON_USE";
const CODEX_INSTALLATION_AVAILABLE = "AVAILABLE";

/**
 * Build a Codex marketplace catalog: `{ name, interface: { displayName }, plugins }`.
 * `displayName` falls back to the marketplace name when the source omits it.
 */
export function buildCodexMarketplace(
  source: { name: string; displayName?: string },
  pluginEntries: readonly Record<string, unknown>[]
): Record<string, unknown> {
  const displayName = typeof source.displayName === "string" ? source.displayName : source.name;
  return { name: source.name, interface: { displayName }, plugins: pluginEntries };
}

/**
 * Build a single Codex marketplace entry. `installation`/`authentication`/`category`
 * are required per the plugin-creator spec; `authentication` and `category` accept a
 * source-entry override, else fall back to the AIDD-shaped defaults.
 */
export function buildCodexMarketplaceEntry(
  name: string,
  srcEntry: Record<string, unknown> | undefined
): Record<string, unknown> {
  const authentication =
    typeof srcEntry?.authentication === "string"
      ? srcEntry.authentication
      : CODEX_DEFAULT_AUTHENTICATION;
  const category =
    typeof srcEntry?.category === "string" ? srcEntry.category : CODEX_DEFAULT_CATEGORY;
  return {
    name,
    source: { source: "local", path: `./plugins/${name}` },
    policy: { installation: CODEX_INSTALLATION_AVAILABLE, authentication },
    category,
  };
}

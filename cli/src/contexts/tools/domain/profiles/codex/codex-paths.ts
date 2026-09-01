/**
 * Codex build output path constants.
 *
 * These constants are intentionally distinct from their source-side equivalents
 * even when the literal values coincide (e.g. OUTPUT_CODEX_MARKETPLACE_RELATIVE
 * mirrors SOURCE_MARKETPLACE_RELATIVE). Future changes to either side must not
 * collapse them.
 */

/** Relative path for the Codex-native plugin manifest inside each plugin output directory. */
export const OUTPUT_CODEX_MANIFEST_RELATIVE = ".codex-plugin/plugin.json";

/**
 * Relative path for the Codex-native marketplace catalog in the codex output tree.
 * This is the official repo-scoped path `codex plugin marketplace add owner/repo`
 * discovers (https://developers.openai.com/codex/plugins/build). The legacy
 * `.claude-plugin/marketplace.json` fallback is intentionally not emitted.
 */
export const OUTPUT_CODEX_MARKETPLACE_RELATIVE = ".agents/plugins/marketplace.json";

/** Subdirectory name inside each plugin output for staged Codex agent TOML files. */
export const OUTPUT_CODEX_AGENTS_DIR = "codex-agents";

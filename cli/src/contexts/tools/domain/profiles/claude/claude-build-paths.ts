/**
 * Claude build output path constants.
 *
 * These constants are intentionally distinct from the source-side constants
 * (SOURCE_PLUGIN_MANIFEST_RELATIVE / SOURCE_MARKETPLACE_RELATIVE in framework-build.ts)
 * even when the literal values coincide. Future changes must not collapse them.
 */

/** Relative path for the Claude-native plugin manifest inside each plugin output directory. */
export const OUTPUT_CLAUDE_MANIFEST_RELATIVE = ".claude-plugin/plugin.json";

/** Relative path for the Claude marketplace catalog in the claude output tree. */
export const OUTPUT_CLAUDE_MARKETPLACE_RELATIVE = ".claude-plugin/marketplace.json";

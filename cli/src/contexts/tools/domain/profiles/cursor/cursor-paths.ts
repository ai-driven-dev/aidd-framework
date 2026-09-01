/**
 * Cursor build output path constants.
 *
 * These constants are intentionally distinct from their source-side equivalents
 * even when the literal values coincide. Future changes to either side must not
 * collapse them.
 */

/** Relative path for the Cursor-native plugin manifest inside each plugin output directory. */
export const OUTPUT_CURSOR_MANIFEST_RELATIVE = ".cursor-plugin/plugin.json";

/** Relative path for the Cursor marketplace catalog in the cursor output tree. */
export const OUTPUT_CURSOR_MARKETPLACE_RELATIVE = ".cursor-plugin/marketplace.json";

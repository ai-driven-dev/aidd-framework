/**
 * Pure helper that substitutes the native marketplace plugin-root token.
 *
 * In a marketplace plugin bundle, hook/mcp path strings are authored with
 * ${CLAUDE_PLUGIN_ROOT} as the canonical source token. Each tool has its own
 * native expansion token:
 *
 *   claude    → ${CLAUDE_PLUGIN_ROOT}   (no-op)
 *   cursor    → ${CURSOR_PLUGIN_ROOT}
 *   codex     → ${PLUGIN_ROOT}
 *   copilot   → ${COPILOT_PLUGIN_ROOT}
 *
 * This helper replaces ALL occurrences of the source token in the content
 * string with the provided target token. For claude the target equals the
 * source, making this a transparent no-op.
 *
 * Only the literal path token is rewritten. Every other ${...} variable
 * (e.g. ${ISSUE_NUMBER}, ${CLAUDE_SESSION_ID}) is left untouched.
 *
 * No I/O, no JSON parsing — pure string substitution.
 */

// Split literal to avoid biome's noTemplateCurlyInString warning.
export const CLAUDE_PLUGIN_ROOT_TOKEN = "$" + "{CLAUDE_PLUGIN_ROOT}";

/**
 * Replace every occurrence of ${CLAUDE_PLUGIN_ROOT} in `content` with
 * `targetToken`. Returns `content` unchanged when targetToken equals the
 * source token (claude no-op path).
 */
export function rewritePluginRootToken(content: string, targetToken: string): string {
  if (targetToken === CLAUDE_PLUGIN_ROOT_TOKEN) return content;
  return content.replaceAll(CLAUDE_PLUGIN_ROOT_TOKEN, targetToken);
}

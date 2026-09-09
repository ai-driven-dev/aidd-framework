import { CLAUDE_PLUGIN_ROOT_TOKEN } from "../../../tools/domain/formats/plugin-root-token.js";

/**
 * Replaces every occurrence of the canonical `${CLAUDE_PLUGIN_ROOT}` source token with the one
 * this tool expands, declared on that tool as `plugins.pluginRootToken`. Only that literal path
 * token is rewritten — every other `${…}` variable is left untouched — and a target equal to
 * the source returns the content unchanged.
 */
export function rewritePluginRootToken(content: string, targetToken: string): string {
  if (targetToken === CLAUDE_PLUGIN_ROOT_TOKEN) return content;
  return content.replaceAll(CLAUDE_PLUGIN_ROOT_TOKEN, targetToken);
}

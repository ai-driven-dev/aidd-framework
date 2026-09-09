/**
 * A Cursor plugin's own `hooks/hooks.json` never fires from the plugin-scope directory Cursor's
 * native install writes it to; only a project-scope `.cursor/hooks.json`, the same file a flat
 * translate already writes, is ever observed running. This module gives `aidd plugin install`
 * that same destination, one plugin at a time.
 */

import { rewriteClaudeRootInJson } from "../../../../kernel/materialization/claude-root-path-rewrite.js";
import { genericFlatHooksScriptPath } from "../../../../kernel/materialization/flat-paths.js";
import { mergeCursorFlatHooks } from "./flat-hooks-merge.js";

const HOOKS_PREFIX = "hooks/";
const CURSOR_HOOKS_DIR = ".cursor/hooks/";

interface CursorHooksFile {
  version?: number;
  hooks?: Record<string, Array<{ command: string }>>;
}

/**
 * Rewrites a plugin's raw `hooks/hooks.json` (Claude nested shape, `${CLAUDE_PLUGIN_ROOT}`
 * commands) to the paths its scripts land at under `.cursor/hooks/<plugin>/`, then merges it
 * into the project's own `.cursor/hooks.json`.
 *
 * This plugin's own prior contribution is stripped first: the merge only appends, so a second
 * install would double every command it owns. Every entry names its own script directory, a
 * plugin-unique substring, so no record of the last contribution is needed.
 */
export function mergeCursorProjectHooksJson(
  existingJson: string | null,
  pluginHooksJson: string,
  pluginName: string
): { content: string; warnings: readonly string[] } {
  const rewritten = rewritePluginRootTokens(pluginHooksJson, pluginName);
  const deduped =
    existingJson === null ? null : serialize(stripPluginEntries(existingJson, pluginName));
  return mergeCursorFlatHooks(deduped, rewritten);
}

/** Removes one plugin's entries from `.cursor/hooks.json`, leaving every other plugin's
 * untouched — what `plugin remove` unmerges an install with. */
export function unmergeCursorProjectHooksJson(existingJson: string, pluginName: string): string {
  return serialize(stripPluginEntries(existingJson, pluginName));
}

/** Where a hook script (everything under `hooks/` but its own manifest) lands once
 * copied into the project, given its path relative to the plugin root. */
export function cursorProjectHooksScriptPath(
  pluginName: string,
  hooksRelativePath: string
): string {
  const rest = hooksRelativePath.startsWith(HOOKS_PREFIX)
    ? hooksRelativePath.slice(HOOKS_PREFIX.length)
    : hooksRelativePath;
  return genericFlatHooksScriptPath(CURSOR_HOOKS_DIR, pluginName, rest);
}

/** The directory a plugin's copied hook scripts live under — nothing else writes here, so
 * `plugin remove` can delete it whole once the hooks.json entries are stripped. */
export function cursorProjectHooksScriptDir(pluginName: string): string {
  return `${CURSOR_HOOKS_DIR}${pluginName}/`;
}

function stripPluginEntries(existingJson: string, pluginName: string): CursorHooksFile {
  const parsed = JSON.parse(existingJson) as CursorHooksFile;
  const marker = cursorProjectHooksScriptDir(pluginName);
  const hooks: Record<string, Array<{ command: string }>> = {};
  for (const [event, entries] of Object.entries(parsed.hooks ?? {})) {
    const kept = entries.filter((entry) => !entry.command.includes(marker));
    if (kept.length > 0) hooks[event] = kept;
  }
  return { version: 1, hooks };
}

function serialize(cursor: CursorHooksFile): string {
  return `${JSON.stringify(cursor, null, 2)}\n`;
}

function rewritePluginRootTokens(pluginHooksJson: string, pluginName: string): string {
  const parsed = JSON.parse(pluginHooksJson) as unknown;
  const rewritten = rewriteClaudeRootInJson(parsed, (suffix) => resolveSuffix(suffix, pluginName));
  return JSON.stringify(rewritten);
}

// A hooks.json command only ever names a path under its own hooks/ — unlike the
// framework-build route, this never needs an agents/ or skills/ branch too.
function resolveSuffix(suffix: string, pluginName: string): string {
  if (!suffix.startsWith(HOOKS_PREFIX)) return suffix;
  return `./${cursorProjectHooksScriptPath(pluginName, suffix)}`;
}

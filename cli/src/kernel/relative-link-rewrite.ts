import { basename, dirname, posix } from "node:path";

// Matches the same non-whitespace, non-quote, non-bracket character class used
// in copilot.ts::rewriteCopilotContent for consistency.
const REFERENCE_CHAR_CLASS = "[^\\s`'\">,]+";

const RELATIVE_CURRENT_RE = new RegExp(`@\\.\\/(${REFERENCE_CHAR_CLASS})`, "g");
const RELATIVE_PARENT_RE = new RegExp(`@\\.\\.\\/(${REFERENCE_CHAR_CLASS})`, "g");

// Matches @${CLAUDE_PLUGIN_ROOT}/<rel> — only when prefixed with @ (spec C-v2.2).
const CLAUDE_ROOT_RE = new RegExp(`@\\$\\{CLAUDE_PLUGIN_ROOT\\}\\/(${REFERENCE_CHAR_CLASS})`, "g");

export interface RewriteRelativeLinksOptions {
  readonly currentFilePluginRelative: string;
  /**
   * Optional override for how @${CLAUDE_PLUGIN_ROOT}/<rel> target paths are
   * resolved before computing the markdown link. Receives the plugin-relative
   * path (e.g. "agents/foo.md") and returns the path to use in the link.
   * Defaults to identity (Mode A behaviour — relative path from current file).
   */
  readonly resolveTargetPath?: (pluginRelPath: string) => string;
}

/**
 * Rewrites @./X → [X](./X), @../X → [X](../X), and
 * @${CLAUDE_PLUGIN_ROOT}/<rel> → a markdown link with a relative path computed
 * from the current file's plugin-relative location (spec §"Content rewrite" rules 1–3).
 *
 * Does NOT rewrite @{{TOOLS}}/... — callers must detect and halt on that pattern.
 * Does NOT touch bare ${CLAUDE_PLUGIN_ROOT} without a leading @ (spec C-v2.2).
 *
 * No inverse: rewriteRelativeLinks is a one-way expansion — @-shorthand is
 * replaced with full markdown links that cannot be unambiguously reversed to the
 * original @-syntax (the label and path are indistinguishable from user-authored links).
 */
export function rewriteRelativeLinks(
  content: string,
  options: RewriteRelativeLinksOptions
): string {
  const afterParent = content.replace(RELATIVE_PARENT_RE, "[$1](../$1)");
  const afterCurrent = afterParent.replace(RELATIVE_CURRENT_RE, "[$1](./$1)");
  return afterCurrent.replace(CLAUDE_ROOT_RE, (_match, rel: string) =>
    rewriteClaudeRootRef(rel, options.currentFilePluginRelative, options.resolveTargetPath)
  );
}

function rewriteClaudeRootRef(
  targetPluginRel: string,
  currentFilePluginRelative: string,
  resolveTargetPath?: (pluginRelPath: string) => string
): string {
  const resolved = resolveTargetPath ? resolveTargetPath(targetPluginRel) : targetPluginRel;
  const currentDirPluginRel = dirname(currentFilePluginRelative);
  let linkPath = posix.relative(currentDirPluginRel, resolved);
  if (!linkPath.startsWith(".")) linkPath = `./${linkPath}`;
  const label = basename(targetPluginRel);
  return `[${label}](${linkPath})`;
}

import { basename, dirname, posix } from "node:path";

// The same character class `rewriteCopilotContent` uses, so both recognise the same
// reference.
const REFERENCE_CHAR_CLASS = "[^\\s`'\">,]+";

const RELATIVE_CURRENT_RE = new RegExp(`@\\.\\/(${REFERENCE_CHAR_CLASS})`, "g");
const RELATIVE_PARENT_RE = new RegExp(`@\\.\\.\\/(${REFERENCE_CHAR_CLASS})`, "g");

// Only with a leading `@`: a bare ${CLAUDE_PLUGIN_ROOT} is left alone.
const CLAUDE_ROOT_RE = new RegExp(`@\\$\\{CLAUDE_PLUGIN_ROOT\\}\\/(${REFERENCE_CHAR_CLASS})`, "g");

export interface RewriteRelativeLinksOptions {
  readonly currentFilePluginRelative: string;
  /** Where a plugin-relative target lands before the link is computed. Defaults to identity,
   * which keeps the link relative to the current file. */
  readonly resolveTargetPath?: (pluginRelPath: string) => string;
}

/**
 * `@{{TOOLS}}/...` is left alone: a caller has to detect that pattern and halt on it.
 *
 * One-way: the markdown links this produces are indistinguishable from ones a person wrote,
 * so the `@`-shorthand cannot be recovered from them.
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

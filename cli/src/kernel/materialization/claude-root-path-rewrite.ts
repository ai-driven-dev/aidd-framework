/**
 * Pure helper that rewrites ${CLAUDE_PLUGIN_ROOT}/<rel> → ./<rel> in every
 * string value of an arbitrary parsed JSON structure (spec §"Hooks" and §"MCP").
 *
 * Recurses through arrays and objects. Rewrites only string VALUES, never keys,
 * so that key names containing the pattern are left untouched (spec §M-v2.4 risk note).
 *
 * No I/O, no path math — plain string prefix substitution.
 */

// Written as a split literal to avoid biome's noTemplateCurlyInString warning.
const CLAUDE_ROOT_PREFIX = "$" + "{CLAUDE_PLUGIN_ROOT}/";
const DEFAULT_RELATIVE_PREFIX = "./";

/**
 * Rewrites ${CLAUDE_PLUGIN_ROOT}/<suffix> in every string value of a parsed JSON
 * structure. The optional `substitute` function receives the suffix (the part after
 * the prefix) and returns the replacement string.
 *
 * Defaults to `(s) => "./" + s` (Mode A behaviour).
 */
export function rewriteClaudeRootInJson(
  parsed: unknown,
  substitute?: (suffix: string) => string
): unknown {
  if (typeof parsed === "string") return rewriteStringValue(parsed, substitute);
  if (Array.isArray(parsed)) return parsed.map((item) => rewriteClaudeRootInJson(item, substitute));
  if (parsed !== null && typeof parsed === "object")
    return rewriteObject(parsed as Record<string, unknown>, substitute);
  return parsed;
}

function rewriteStringValue(value: string, substitute?: (suffix: string) => string): string {
  if (!value.includes(CLAUDE_ROOT_PREFIX)) return value;
  if (!substitute) return value.replaceAll(CLAUDE_ROOT_PREFIX, DEFAULT_RELATIVE_PREFIX);
  return value.split(CLAUDE_ROOT_PREFIX).reduce((acc, segment, i) => {
    if (i === 0) return segment;
    const spaceIdx = segment.search(/[\s"'<>]/);
    const suffix = spaceIdx === -1 ? segment : segment.slice(0, spaceIdx);
    const rest = spaceIdx === -1 ? "" : segment.slice(spaceIdx);
    return acc + substitute(suffix) + rest;
  }, "");
}

function rewriteObject(
  obj: Record<string, unknown>,
  substitute?: (suffix: string) => string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = rewriteClaudeRootInJson(value, substitute);
  }
  return result;
}

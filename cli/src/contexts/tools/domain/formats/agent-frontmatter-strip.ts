/**
 * Copilot-supported frontmatter keys for agent files.
 * Order is preserved on serialization for deterministic output (AC #2).
 */
export const COPILOT_AGENT_FRONTMATTER_KEYS: readonly [
  "name",
  "description",
  "model",
  "tools",
  "agents",
  "argument-hint",
] = ["name", "description", "model", "tools", "agents", "argument-hint"];

/**
 * Cursor-supported frontmatter keys for agent files.
 * Cursor documents only name/description/model — never tools/color.
 */
export const CURSOR_AGENT_FRONTMATTER_KEYS: readonly ["name", "description", "model"] = [
  "name",
  "description",
  "model",
];

/**
 * Pick only the specified keys from a frontmatter object, preserving the given key order.
 * Keys with undefined values are omitted.
 */
export function pickFrontmatterKeys(
  fm: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (fm[key] !== undefined) {
      result[key] = fm[key];
    }
  }
  return result;
}

/**
 * Returns a new object containing only the Copilot-supported frontmatter keys
 * with non-undefined values. Iteration order matches the allowlist constant.
 *
 * No inverse: stripCopilotAgentFrontmatter is lossy — keys not in the allowlist are
 * permanently discarded and cannot be recovered from the output.
 */
export function stripCopilotAgentFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
  return pickFrontmatterKeys(fm, COPILOT_AGENT_FRONTMATTER_KEYS);
}

/**
 * Returns a new object containing only the Cursor-supported frontmatter keys
 * (name, description, model) with non-undefined values. Tools/color/argument-hint
 * are permanently discarded.
 */
export function stripCursorAgentFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
  return pickFrontmatterKeys(fm, CURSOR_AGENT_FRONTMATTER_KEYS);
}

/**
 * Alias for stripCopilotAgentFrontmatter — preserves backward compatibility.
 */
export function stripAgentFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
  return stripCopilotAgentFrontmatter(fm);
}

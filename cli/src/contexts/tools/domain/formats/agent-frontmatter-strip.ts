/** Copilot-supported frontmatter keys for agent files. Order is preserved on serialization,
 * for deterministic output. */
export const COPILOT_AGENT_FRONTMATTER_KEYS: readonly [
  "name",
  "description",
  "model",
  "tools",
  "agents",
  "argument-hint",
] = ["name", "description", "model", "tools", "agents", "argument-hint"];

/** Cursor-supported frontmatter keys: Cursor documents only name, description and model —
 * never tools or color. */
export const CURSOR_AGENT_FRONTMATTER_KEYS: readonly ["name", "description", "model"] = [
  "name",
  "description",
  "model",
];

/** Pick only the given keys, preserving their order. A key whose value is undefined is
 * omitted. */
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

/** Only the Copilot-supported keys, in the allowlist's own order. Lossy, so there is no
 * inverse: a key outside the allowlist cannot be recovered from the output. */
export function stripCopilotAgentFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
  return pickFrontmatterKeys(fm, COPILOT_AGENT_FRONTMATTER_KEYS);
}

/** Only the Cursor-supported keys. Tools, color and argument-hint are discarded. */
export function stripCursorAgentFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
  return pickFrontmatterKeys(fm, CURSOR_AGENT_FRONTMATTER_KEYS);
}

export function stripAgentFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
  return stripCopilotAgentFrontmatter(fm);
}

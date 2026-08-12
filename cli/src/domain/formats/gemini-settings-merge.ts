/**
 * Pure merge helpers for the single-authority `.gemini/settings.json` file.
 *
 * Gemini CLI has three logical writers landing in the same file at framework-build time:
 * hooks, mcpServers, and the context.fileName seed. Each function here is pure (no I/O)
 * and preserves every top-level key it does not own, so the three writers can run in
 * sequence (hooks, then mcp via mergeVscodeMcp, then the seed) without clobbering
 * each other or user-authored keys.
 *
 * Claude event names (source): PreToolUse, PostToolUse, UserPromptSubmit, Stop,
 * SubAgentStop, SessionStart, SessionEnd, PreCompact, Notification (PascalCase).
 * Gemini CLI's own event names differ; see GEMINI_HOOK_EVENT_MAP.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

type ClaudeHookItem = {
  type?: string;
  command?: string;
  timeout?: number;
  description?: string;
  [key: string]: unknown;
};
type ClaudeMatcherGroup = { matcher?: string; hooks: ClaudeHookItem[] };
type ClaudeHooksShape = { hooks?: Record<string, ClaudeMatcherGroup[]> };

type GeminiHookEntry = { type: string; command: string; timeout?: number; description?: string };
type GeminiMatcherGroup = { matcher?: string; hooks: GeminiHookEntry[] };
type GeminiSettingsShape = {
  hooks?: Record<string, GeminiMatcherGroup[]>;
  context?: { fileName?: string | string[] };
  [key: string]: unknown;
};

// ── Event mapping ─────────────────────────────────────────────────────────────

/** Official Claude → Gemini hook event table, per `gemini hooks migrate --from-claude`. */
export const GEMINI_HOOK_EVENT_MAP: Readonly<Record<string, string>> = {
  PreToolUse: "BeforeTool",
  PostToolUse: "AfterTool",
  UserPromptSubmit: "BeforeAgent",
  Stop: "AfterAgent",
  SubAgentStop: "AfterAgent",
  SessionStart: "SessionStart",
  SessionEnd: "SessionEnd",
  PreCompact: "PreCompress",
  Notification: "Notification",
};

// ── Hooks: merge into .gemini/settings.json `hooks` key ───────────────────────

/**
 * Merges a plugin's hooks (Claude nested shape) additively into the top-level `hooks`
 * key of `.gemini/settings.json`, translating event names via GEMINI_HOOK_EVENT_MAP.
 * Preserves every other top-level key (mcpServers, context, user-authored keys).
 *
 * An unmapped Claude event is dropped with a warning rather than written as an
 * invalid Gemini event name.
 *
 * @param existingSettings - Current file content, or null if absent.
 * @param pluginHooksJson  - Path-rewritten plugin hooks.json content (Claude nested shape).
 */
export function mergeGeminiSettingsHooks(
  existingSettings: string | null,
  pluginHooksJson: string
): { content: string; warnings: readonly string[] } {
  const settings: GeminiSettingsShape = existingSettings ? JSON.parse(existingSettings) : {};
  const plugin = JSON.parse(pluginHooksJson) as ClaudeHooksShape;
  const pluginHooks = plugin.hooks ?? {};
  const existingHooks = settings.hooks ?? {};
  const { merged, warnings } = appendMappedHooks(existingHooks, pluginHooks);
  return {
    content: `${JSON.stringify({ ...settings, hooks: merged }, null, 2)}\n`,
    warnings,
  };
}

function appendMappedHooks(
  existing: Record<string, GeminiMatcherGroup[]>,
  incoming: Record<string, ClaudeMatcherGroup[]>
): { merged: Record<string, GeminiMatcherGroup[]>; warnings: readonly string[] } {
  const merged: Record<string, GeminiMatcherGroup[]> = { ...existing };
  const warnings: string[] = [];
  for (const [claudeEvent, matchers] of Object.entries(incoming)) {
    const geminiEvent = GEMINI_HOOK_EVENT_MAP[claudeEvent];
    if (!geminiEvent) {
      warnings.push(`gemini: unmapped hook event '${claudeEvent}' skipped`);
      continue;
    }
    const entries = convertToGeminiEntries(matchers);
    merged[geminiEvent] = [...(merged[geminiEvent] ?? []), ...entries];
  }
  return { merged, warnings };
}

function convertToGeminiEntries(matchers: ClaudeMatcherGroup[]): GeminiMatcherGroup[] {
  return matchers.map((group) => ({
    ...(group.matcher !== undefined ? { matcher: group.matcher } : {}),
    hooks: group.hooks
      .filter((item) => typeof item.command === "string")
      .map((item) => buildGeminiHookEntry(item)),
  }));
}

function buildGeminiHookEntry(item: ClaudeHookItem): GeminiHookEntry {
  const entry: GeminiHookEntry = { type: item.type ?? "command", command: item.command as string };
  if (typeof item.timeout === "number") entry.timeout = item.timeout;
  if (typeof item.description === "string") entry.description = item.description;
  return entry;
}

// ── Settings seed: idempotent context.fileName array union ───────────────────

/**
 * Merges the bundled settings seed (carrying `context.fileName`) into the accumulated
 * `.gemini/settings.json` after hooks and mcp have already written their keys.
 *
 * Every key survives except `context`, which is merged specially: `fileName` is an
 * idempotent, order-preserving array union (existing entries first, never removed;
 * new seed entries appended) — never a wholesale replace, so a pre-existing user
 * `context.fileName` is never lost. Every other top-level key from `existing` wins
 * over the seed (the seed only fills in what is not already present).
 *
 * @param existing - Current accumulated file content, or "" if the file does not exist yet.
 * @param seed     - Bundled settings seed content (assets/configs/gemini/settings.json).
 */
export function mergeGeminiSettingsSeed(existing: string, seed: string): string {
  const existingObj: GeminiSettingsShape = existing.trim() ? JSON.parse(existing) : {};
  const seedObj: GeminiSettingsShape = JSON.parse(seed);
  const context = mergeGeminiContext(existingObj.context, seedObj.context);
  return `${JSON.stringify({ ...seedObj, ...existingObj, context }, null, 2)}\n`;
}

function mergeGeminiContext(
  existingContext: GeminiSettingsShape["context"],
  seedContext: GeminiSettingsShape["context"]
): Record<string, unknown> {
  const existing = existingContext ?? {};
  const seed = seedContext ?? {};
  const fileName = unionFileNames(
    normalizeFileNames(existing.fileName),
    normalizeFileNames(seed.fileName)
  );
  return { ...seed, ...existing, fileName };
}

function normalizeFileNames(value: string | string[] | undefined): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

function unionFileNames(existing: readonly string[], incoming: readonly string[]): string[] {
  const result = [...existing];
  for (const name of incoming) {
    if (!result.includes(name)) result.push(name);
  }
  return result;
}

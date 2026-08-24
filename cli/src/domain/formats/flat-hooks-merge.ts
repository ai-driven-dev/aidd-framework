/**
 * Pure shape-transform and merge helpers for per-tool flat hook config registration.
 *
 * Each function handles the structural difference between how Claude (framework source
 * format), Cursor, Copilot, and Codex expect hooks to be registered in flat mode.
 *
 * All functions are pure (no I/O). They receive and return JSON-serialisable values.
 *
 * Claude event names (source) are PascalCase; Cursor maps supported events to camelCase.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

type ClaudeHookItem = { type?: string; command?: string; [key: string]: unknown };
type ClaudeMatcherGroup = { matcher?: string; hooks: ClaudeHookItem[] };
type ClaudeHooksShape = { hooks?: Record<string, ClaudeMatcherGroup[]> };

type FlatHookEntry = { type: string; command: string; timeout?: number };
type CopilotFlatShape = { version: 1; hooks?: Record<string, FlatHookEntry[]> };

type CursorHookEntry = { command: string };
type CursorFlatShape = { version: 1; hooks: Record<string, CursorHookEntry[]> };

type CodexHookEntry = {
  matcher?: string;
  hooks: Array<{ type: string; command: string; timeout?: number; statusMessage?: string }>;
};
type CodexHooksShape = { hooks?: Record<string, CodexHookEntry[]> };

// ── Event mapping ─────────────────────────────────────────────────────────────

// `Stop` fans out to two Cursor events, not one: measured (2026-08-22, see
// measurements.md Phase 6) interactive sessions fire `stop` and headless sessions
// fire `sessionEnd` instead — never both from the same run, but which one depends
// on how the session ends, so both are subscribed. A run file already tolerates
// more than one `turn_end` line (two real `stop` firings, one interactive session,
// Phase 4 addendum), so a session that happens to fire both is not a problem.
const CURSOR_EVENT_MAP: Record<string, readonly string[]> = {
  SessionStart: ["sessionStart"],
  UserPromptSubmit: ["beforeSubmitPrompt"],
  PreToolUse: ["preToolUse"],
  PostToolUse: ["postToolUse"],
  Stop: ["stop", "sessionEnd"],
  SubagentStop: ["subagentStop"],
};

// Codex keeps Claude's event names, with one exception it does not have: there is no
// `Stop`. Its vocabulary, read out of the 0.149.0 binary itself, is PreToolUse,
// PermissionRequest, PostToolUse, PreCompact, PostCompact, SessionStart, SessionEnd,
// SubagentStart, SubagentStop - and a live probe confirmed it: a `codex exec` run with all
// four subscribed fired SessionStart and SessionEnd and never Stop, so a turn was never
// closed and every Codex session journalled a session_start with nothing after it.
//
// SessionEnd is coarser than Stop by nature: it bounds the session, not each turn. For
// `codex exec` the two coincide, and for an interactive session one turn_end bounding the
// whole session is the honest answer rather than none at all. The journal already tolerates
// more than one turn_end line, so nothing downstream depends on there being exactly one.
const CODEX_EVENT_MAP: Record<string, readonly string[]> = {
  Stop: ["SessionEnd"],
};

/**
 * Renames a plugin hooks.json's events to the ones Codex delivers, without merging.
 *
 * Codex is installed two ways - a built marketplace tree and a merged project config - and
 * the two have drifted apart three times. Both call this, so the rename cannot land on one
 * route and not the other, which is exactly how a Codex session came to journal a
 * session_start with nothing after it.
 */
export function renameCodexHookEvents(pluginHooksJson: string): string {
  const parsed = JSON.parse(pluginHooksJson) as ClaudeHooksShape;
  if (!parsed.hooks) return pluginHooksJson;
  const renamed: Record<string, ClaudeMatcherGroup[]> = {};
  for (const [event, matchers] of Object.entries(parsed.hooks)) {
    for (const codexEvent of CODEX_EVENT_MAP[event] ?? [event]) {
      renamed[codexEvent] = [...(renamed[codexEvent] ?? []), ...matchers];
    }
  }
  return `${JSON.stringify({ ...parsed, hooks: renamed }, null, 2)}\n`;
}

// ── Claude: merge hooks into .claude/settings.json ────────────────────────────

/**
 * Merges a plugin's hooks (Claude nested shape) additively into the top-level
 * `hooks` key of `.claude/settings.json`. Preserves all other settings keys.
 *
 * @param existingSettings - Current file content, or null if absent.
 * @param pluginHooksJson  - Path-rewritten plugin hooks.json content (Claude nested shape).
 * @returns { content: new settings.json content, warnings: [] }
 */
export function mergeClaudeSettingsHooks(
  existingSettings: string | null,
  pluginHooksJson: string
): { content: string; warnings: readonly string[] } {
  const settings = existingSettings
    ? (JSON.parse(existingSettings) as Record<string, unknown>)
    : {};
  const plugin = JSON.parse(pluginHooksJson) as ClaudeHooksShape;
  const pluginHooks = plugin.hooks ?? {};
  const existing = (settings.hooks as Record<string, unknown[]>) ?? {};
  const merged = appendHooksEntries(existing, pluginHooks);
  return {
    content: `${JSON.stringify({ ...settings, hooks: merged }, null, 2)}\n`,
    warnings: [],
  };
}

function appendHooksEntries(
  existing: Record<string, unknown[]>,
  incoming: Record<string, ClaudeMatcherGroup[]>
): Record<string, unknown[]> {
  const result: Record<string, unknown[]> = { ...existing };
  for (const [event, matchers] of Object.entries(incoming)) {
    result[event] = [...(result[event] ?? []), ...matchers];
  }
  return result;
}

// ── Copilot: flatten nested hooks shape ───────────────────────────────────────

/**
 * Flattens the Claude nested matcher-group shape into Copilot's expected flat shape:
 * `hooks.EVENT[]` of `{type, command, timeout?}`.
 *
 * @param pluginHooksJson - Raw plugin hooks.json in Claude nested shape.
 * @returns New flat-shape hooks JSON string.
 */
export function flattenCopilotHooksShape(pluginHooksJson: string): string {
  const parsed = JSON.parse(pluginHooksJson) as ClaudeHooksShape;
  const claudeHooks = parsed.hooks ?? {};
  const flat: Record<string, FlatHookEntry[]> = {};

  for (const [event, matchers] of Object.entries(claudeHooks)) {
    const entries = flattenMatcherGroups(matchers);
    if (entries.length > 0) flat[event] = entries;
  }

  const output: CopilotFlatShape = { version: 1 };
  if (Object.keys(flat).length > 0) output.hooks = flat;
  return `${JSON.stringify(output, null, 2)}\n`;
}

function flattenMatcherGroups(matchers: ClaudeMatcherGroup[]): FlatHookEntry[] {
  const entries: FlatHookEntry[] = [];
  for (const group of matchers) {
    for (const item of group.hooks ?? []) {
      if (typeof item.command !== "string") continue;
      const entry: FlatHookEntry = { type: item.type ?? "command", command: item.command };
      if (typeof item.timeout === "number") entry.timeout = item.timeout;
      entries.push(entry);
    }
  }
  return entries;
}

// ── Cursor: event-mapped merge into single .cursor/hooks.json ─────────────────

/**
 * Merges a plugin's hooks (Claude nested shape) into the accumulated `.cursor/hooks.json`
 * with version:1, event-mapped keys, and flat `{command}` entries.
 *
 * Unmapped events are skipped and reported in the returned warnings list.
 *
 * @param existingCursorJson - Current .cursor/hooks.json content, or null.
 * @param pluginHooksJson    - Path-rewritten plugin hooks.json in Claude nested shape.
 * @returns { content, warnings }
 */
export function mergeCursorFlatHooks(
  existingCursorJson: string | null,
  pluginHooksJson: string
): { content: string; warnings: readonly string[] } {
  const cursor = parseCursorHooks(existingCursorJson);
  const plugin = JSON.parse(pluginHooksJson) as ClaudeHooksShape;
  const pluginHooks = plugin.hooks ?? {};
  const warnings: string[] = [];

  for (const [claudeEvent, matchers] of Object.entries(pluginHooks)) {
    const cursorEvents = CURSOR_EVENT_MAP[claudeEvent];
    if (!cursorEvents) {
      warnings.push(`cursor: unmapped event '${claudeEvent}' skipped`);
      continue;
    }
    const entries = extractCursorEntries(matchers);
    for (const cursorEvent of cursorEvents) {
      cursor.hooks[cursorEvent] = [...(cursor.hooks[cursorEvent] ?? []), ...entries];
    }
  }

  return { content: `${JSON.stringify(cursor, null, 2)}\n`, warnings };
}

function parseCursorHooks(content: string | null): CursorFlatShape {
  if (!content) return { version: 1, hooks: {} };
  const parsed = JSON.parse(content) as Partial<CursorFlatShape>;
  return { version: 1, hooks: parsed.hooks ?? {} };
}

function extractCursorEntries(matchers: ClaudeMatcherGroup[]): CursorHookEntry[] {
  const entries: CursorHookEntry[] = [];
  for (const group of matchers) {
    for (const item of group.hooks ?? []) {
      if (typeof item.command === "string") entries.push({ command: item.command });
    }
  }
  return entries;
}

// ── Codex: framework plugin hooks into .codex/hooks.json ─────────────────────

/**
 * Merges a plugin's hooks (Claude nested shape) into `.codex/hooks.json` using
 * Codex's nested shape WITH top-level `hooks` wrapper.
 *
 * Does NOT emit the install-mode memory hook (node .aidd/scripts/update_memory.cjs).
 * That hook belongs to HooksCapability.mergeFn (mergeCodexHooksJson) in install mode.
 *
 * @param existingJson    - Current .codex/hooks.json content, or null.
 * @param pluginHooksJson - Path-rewritten plugin hooks.json in Claude nested shape.
 * @returns { content, warnings: [] }
 */
export function mergeCodexFrameworkHooksJson(
  existingJson: string | null,
  pluginHooksJson: string
): { content: string; warnings: readonly string[] } {
  const codex = parseCodexHooks(existingJson);
  const plugin = JSON.parse(pluginHooksJson) as ClaudeHooksShape;
  const pluginHooks = plugin.hooks ?? {};

  for (const [event, matchers] of Object.entries(pluginHooks)) {
    for (const codexEvent of CODEX_EVENT_MAP[event] ?? [event]) {
      codex.hooks[codexEvent] = [
        ...(codex.hooks[codexEvent] ?? []),
        ...convertToCodexEntries(matchers),
      ];
    }
  }

  return {
    content: `${JSON.stringify({ hooks: codex.hooks }, null, 2)}\n`,
    warnings: [],
  };
}

function parseCodexHooks(
  content: string | null
): CodexHooksShape & { hooks: Record<string, CodexHookEntry[]> } {
  if (!content) return { hooks: {} };
  const parsed = JSON.parse(content) as CodexHooksShape;
  return { hooks: parsed.hooks ?? {} };
}

function convertToCodexEntries(matchers: ClaudeMatcherGroup[]): CodexHookEntry[] {
  return matchers.map((group) => ({
    ...(group.matcher !== undefined ? { matcher: group.matcher } : {}),
    hooks: group.hooks
      .filter((item) => typeof item.command === "string")
      .map((item) => buildCodexHookItem(item)),
  }));
}

function buildCodexHookItem(item: ClaudeHookItem): {
  type: string;
  command: string;
  timeout?: number;
  statusMessage?: string;
} {
  const entry: { type: string; command: string; timeout?: number; statusMessage?: string } = {
    type: item.type ?? "command",
    command: item.command as string,
  };
  if (typeof item.timeout === "number") entry.timeout = item.timeout;
  if (typeof item.statusMessage === "string") entry.statusMessage = item.statusMessage;
  return entry;
}

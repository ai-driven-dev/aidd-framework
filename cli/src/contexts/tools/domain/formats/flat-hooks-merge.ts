/**
 * Pure shape transforms between the framework's Claude-shaped hooks source and each flat
 * tool's own registration format, no I/O. Claude event names are PascalCase; Cursor maps the
 * events it supports to camelCase.
 */

import { asPlainObject } from "../../../../kernel/reading/plain-object.js";

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

// `Stop` fans out to two Cursor events, not one: interactive sessions fire `stop` and headless
// ones `sessionEnd` instead — never both from the same run, but which one depends on how the
// session ends, so both are subscribed. A run file already tolerates more than one `turn_end`
// line, so a session firing both is not a problem.
const CURSOR_EVENT_MAP: Record<string, readonly string[]> = {
  SessionStart: ["sessionStart"],
  UserPromptSubmit: ["beforeSubmitPrompt"],
  PreToolUse: ["preToolUse"],
  PostToolUse: ["postToolUse"],
  Stop: ["stop", "sessionEnd"],
  SubagentStop: ["subagentStop"],
};

// Codex keeps Claude's event names but has no `Stop`: probed live, a `codex exec` run with all
// four subscribed fired SessionStart and SessionEnd and never Stop, so a turn was never closed
// and every Codex session journalled a session_start with nothing after it. SessionEnd bounds
// the session rather than each turn, which the journal tolerates — one turn_end bounding the
// whole session is the honest answer rather than none at all.
const CODEX_EVENT_MAP: Record<string, readonly string[]> = {
  Stop: ["SessionEnd"],
};

/**
 * Renames a plugin hooks.json's events to the ones Codex delivers, without merging.
 *
 * Codex is installed two ways — a built marketplace tree and a merged project config — and both
 * call this, so the rename cannot land on one route and not the other.
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

/** Merges a plugin's hooks (Claude nested shape) additively into the top-level `hooks` key of
 * `.claude/settings.json`, preserving every other settings key. */
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

/** Flattens the Claude nested matcher-group shape into Copilot's flat `hooks.EVENT[]` of
 * `{type, command, timeout?}`. */
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

/** Merges a plugin's hooks (Claude nested shape) into the accumulated `.cursor/hooks.json`:
 * version 1, event-mapped keys, flat `{command}` entries. An unmapped event is skipped and
 * reported in the returned warnings. */
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

/** Merges a plugin's hooks (Claude nested shape) into `.codex/hooks.json`, Codex's nested shape
 * under a top-level `hooks` wrapper. Emits no install-mode memory hook — that one belongs to
 * `HooksCapability.mergeFn`. */
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

/**
 * Every `command` string registered for `claudeEvent` in a hooks file already written in any of
 * the four shapes this module writes, plus whatever alias `CURSOR_EVENT_MAP` maps that event to.
 * Malformed content, or a shape none of the four writers produce, answers `[]` rather than
 * throwing: an unrecognised shape is not evidence of anything. A reader asking whether a hooks
 * block called for a command calls this rather than restating the four shapes, so a fifth shape
 * recognised here is recognised there too.
 */
export function hookCommandsForEvent(hooksFileContent: string, claudeEvent: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(hooksFileContent);
  } catch {
    return [];
  }
  const hooks = asPlainObject(asPlainObject(parsed)?.hooks);
  if (hooks === null) return [];
  const commands: string[] = [];
  for (const eventName of [claudeEvent, ...(CURSOR_EVENT_MAP[claudeEvent] ?? [])]) {
    const entries = hooks[eventName];
    if (Array.isArray(entries)) for (const entry of entries) collectCommands(entry, commands);
  }
  return commands;
}

// Both known entry depths in one walk: a nested group (`{ hooks: [...] }`, Claude/Codex)
// recurses one level into its own `hooks` array; a flat entry (`{ command }`, Copilot/Cursor)
// has none and contributes its own command directly.
function collectCommands(entry: unknown, out: string[]): void {
  const record = asPlainObject(entry);
  if (record === null) return;
  if (Array.isArray(record.hooks)) {
    for (const nested of record.hooks) collectCommands(nested, out);
    return;
  }
  if (typeof record.command === "string") out.push(record.command);
}

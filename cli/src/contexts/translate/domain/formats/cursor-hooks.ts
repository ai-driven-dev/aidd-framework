import type { HooksContentFormat } from "../../../tools/domain/hooks-format.js";

type ClaudeHookMatcher = { hooks: ClaudeHookItem[] };
type ClaudeHookItem = { type?: string; command?: string; [key: string]: unknown };
type ClaudeHooksJson = { hooks?: Record<string, ClaudeHookMatcher[]> };

// One-way: the Cursor plugin format drops Claude's matcher structure, so the transform cannot
// be reversed to the original hooks JSON.
export function convertHooksFormat(content: string, format: HooksContentFormat): string {
  if (format === "flat") return convertClaudeHooksToCursorPlugin(content);
  return content;
}

export function convertClaudeHooksToCursorPlugin(content: string): string {
  const parsed = JSON.parse(content) as ClaudeHooksJson;
  const claudeHooks = parsed.hooks ?? {};
  const cursorHooks: Record<string, ClaudeHookItem[]> = {};

  for (const [event, matchers] of Object.entries(claudeHooks)) {
    const camelEvent = event.charAt(0).toLowerCase() + event.slice(1);
    const items: ClaudeHookItem[] = [];
    for (const matcher of matchers) {
      for (const item of matcher.hooks ?? []) {
        items.push(substitutePluginRoot(item));
      }
    }
    if (items.length > 0) cursorHooks[camelEvent] = items;
  }

  return JSON.stringify({ hooks: cursorHooks }, null, 2);
}

function substitutePluginRoot(item: ClaudeHookItem): ClaudeHookItem {
  if (typeof item.command !== "string") return item;
  return {
    ...item,
    command: item.command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}\//g, "./"),
  };
}

export type HooksContentFormat = "claude" | "cursor";

type ClaudeHookMatcher = { hooks: ClaudeHookItem[] };
type ClaudeHookItem = { type?: string; command?: string; [key: string]: unknown };
type ClaudeHooksJson = { hooks?: Record<string, ClaudeHookMatcher[]> };

// No inverse: convertHooksFormat (and convertClaudeHooksToCursorPlugin) is a one-way
// schema transformation — the Cursor plugin format drops Claude-specific matcher
// structure and cannot be reversed to the original Claude hooks JSON.
export function convertHooksFormat(content: string, format: HooksContentFormat): string {
  if (format === "cursor") return convertClaudeHooksToCursorPlugin(content);
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

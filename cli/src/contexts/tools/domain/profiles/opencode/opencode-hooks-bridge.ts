/**
 * Generates OpenCode's event bridge for one plugin's hooks.json (opencode-and-scope.md,
 * Lot B). OpenCode's loader scans no "hooks" family (F3, opencode-paths.ts) and this
 * profile writes no hooks.json at all (build.ts's `skipHooksJson`) — without this module a
 * plugin's declared hooks have no trigger on OpenCode whatsoever. The generated file is a
 * real OpenCode plugin (`export const`, only one function-valued export — F6): it spawns
 * the same scripts every other host's hooks.json already names, over the stdin-JSON
 * contract those scripts already read (`hook_event_name`, `session_id`, `cwd`, and for a
 * tool event `tool_name`/`tool_input` — plugins/aidd-context/hooks/update_memory.js reads
 * only `cwd` via its own `process.cwd()`, which the spawn's `cwd` option sets correctly).
 *
 * Only three hooks.json events are mapped; anything else is dropped, because OpenCode's
 * plugin surface delivers no event these hooks could otherwise ride on:
 *
 * - `SessionStart` runs once, when the generated plugin's own factory is called — this is
 *   an approximation, not "once per session". OpenCode's `session.created` is published on
 *   its bus but was never observed delivered to a plugin's `event` hook (measured
 *   2026-08-31, plugins/aidd-telemetry/hooks/opencode-plugin.js:53-56 and its own README),
 *   and the factory itself runs once per server/directory, not once per session. Safe only
 *   for an idempotent hook: every `SessionStart` hook this generator sees today is
 *   (`update_memory.js` rewrites a fixed delimited block, so replaying it changes nothing).
 * - `Stop` maps to `session.idle`, delivered once per turn.
 * - `PostToolUse` maps to `message.part.updated` whose `part.state.status === "completed"`
 *   — the one shape measured live against a running OpenCode (opencode-plugin.js:100-106,
 *   scripts/__tests__/fixtures/opencode-tool-part-completed.json: `part.tool` names the
 *   tool, `part.state.input` is its arguments). `tool.execute.after` reads cleaner in
 *   OpenCode's own docs (https://opencode.ai/docs/plugins/, "Tool Events") but is a
 *   separate named hook `(input, output)`, not an `event({event})` payload, and nothing in
 *   this repository has ever captured it — not adopted (opencode-and-scope.md, Lot B).
 *
 * A `matcher` on a `PostToolUse` group filters by tool name, exact or pipe-separated
 * alternation — the same convention profiles/codex/profile.ts's own SessionStart matcher
 * ("startup|resume") already uses; absent, every tool matches.
 */

interface ParsedHookCall {
  readonly script: string;
  readonly args: readonly string[];
}

interface ParsedPostToolUseCall extends ParsedHookCall {
  readonly matcher?: string;
}

interface OpencodeHookTable {
  readonly sessionStart: readonly ParsedHookCall[];
  readonly stop: readonly ParsedHookCall[];
  readonly postToolUse: readonly ParsedPostToolUseCall[];
}

interface ClaudeHookItem {
  readonly type?: string;
  readonly command?: string;
}

interface ClaudeMatcherGroup {
  readonly matcher?: string;
  readonly hooks?: readonly ClaudeHookItem[];
}

interface ClaudeHooksShape {
  readonly hooks?: Record<string, readonly ClaudeMatcherGroup[]>;
}

// Only a command this generator can actually replay: `node ${CLAUDE_PLUGIN_ROOT}/hooks/<rel>
// [args...]`. A hooks.json entry invoking anything else (a shell script run directly, no
// "node " prefix) is a shape only Claude's own settings.json target ever runs, and is
// dropped here rather than guessed at.
const COMMAND_PATTERN = /^node\s+\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/(\S+)(.*)$/;

function parseCommand(command: string | undefined): ParsedHookCall | null {
  if (typeof command !== "string") return null;
  const match = COMMAND_PATTERN.exec(command.trim());
  if (!match) return null;
  const [, script, rest] = match;
  const args = rest.trim().length > 0 ? rest.trim().split(/\s+/) : [];
  return { script, args };
}

function parseGroups(groups: readonly ClaudeMatcherGroup[] | undefined): ParsedPostToolUseCall[] {
  const calls: ParsedPostToolUseCall[] = [];
  for (const group of groups ?? []) {
    for (const item of group.hooks ?? []) {
      const parsed = parseCommand(item.command);
      if (parsed === null) continue;
      calls.push(group.matcher ? { ...parsed, matcher: group.matcher } : parsed);
    }
  }
  return calls;
}

/** Pure: a plugin's raw hooks.json (still carrying `${CLAUDE_PLUGIN_ROOT}`, unrewritten —
 * the generated bridge resolves its scripts from its own `import.meta.url`, so the
 * outDir-relative rewrite every other flat target needs buys this one nothing) reduced to
 * the three mapped events. Exported for the generator's own unit test, never used outside
 * this module otherwise. */
export function parseHooksJsonForBridge(rawHooksJson: string): OpencodeHookTable {
  const parsed = JSON.parse(rawHooksJson) as ClaudeHooksShape;
  const hooks = parsed.hooks ?? {};
  return {
    sessionStart: parseGroups(hooks.SessionStart),
    stop: parseGroups(hooks.Stop),
    postToolUse: parseGroups(hooks.PostToolUse),
  };
}

// Every plugin this generator sees is already named "aidd-<something>", so hardcoding an
// "Aidd" prefix here would stutter ("AiddAiddContextHooks") rather than name anything a
// prefix wouldn't already say — the plugin's own name, PascalCased, already carries it.
function toIdentifier(plugin: string): string {
  const pascal = plugin
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("");
  return `${pascal}Hooks`;
}

function callTableLiteral(calls: readonly ParsedHookCall[]): string {
  return JSON.stringify(calls);
}

/** Pure: a plugin's raw hooks.json + its name -> the full text of its generated OpenCode
 * bridge module, or `null` when none of the three mapped events named anything replayable
 * (an empty hooks.json, or one carrying only an unmapped event such as `PreToolUse`) — a
 * bridge with nothing to spawn is not a file worth writing. */
export function generateOpencodeHooksBridge(rawHooksJson: string, plugin: string): string | null {
  const table = parseHooksJsonForBridge(rawHooksJson);
  if (
    table.sessionStart.length === 0 &&
    table.stop.length === 0 &&
    table.postToolUse.length === 0
  ) {
    return null;
  }
  const ident = toIdentifier(plugin);
  return `// Generated by aidd from plugins/${plugin}/hooks/hooks.json - do not edit by hand.
// OpenCode's plugin loader scans no "hooks" family and this profile writes no hooks.json
// (build.ts's skipHooksJson, translated here rather than skipped) - this file is the only
// trigger this plugin's declared hooks have on OpenCode. See opencode-hooks-bridge.ts for
// the mapping this generator applies and the measurements behind it.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Never process.execPath: OpenCode ships as its own standalone binary (see
// plugins/aidd-telemetry/hooks/opencode-plugin.js:29-30) - that path names \`opencode\`
// itself, not a Node runtime able to run this plugin's own hook scripts.
const HOOKS_DIR = fileURLToPath(new URL("../hooks/${plugin}/", import.meta.url));

const SESSION_START = ${callTableLiteral(table.sessionStart)};
const STOP = ${callTableLiteral(table.stop)};
const POST_TOOL_USE = ${callTableLiteral(table.postToolUse)};

// Asynchronous on purpose, unlike opencode-plugin.js's own spawnSync: that file spawns at
// most one script per event, this one can spawn one per matching hook across every mapped
// event, and blocking OpenCode's event loop once per hook multiplies the cost its own
// comment already accepts for a single call. A failed spawn (ENOENT, a killed timeout)
// must not throw past this function - both listeners below, plus the caller's own
// try/catch, exist because a spawn that never launches can still throw on the stdin write.
function runHook(script, args, payload, directory) {
  const child = spawn("node", [HOOKS_DIR + script, ...args], {
    cwd: directory,
    stdio: ["pipe", "ignore", "ignore"],
    timeout: 5000,
  });
  child.on("error", () => {});
  child.stdin.on("error", () => {});
  child.stdin.end(JSON.stringify(payload));
}

/** Pure: \`session.idle\` -> every Stop hook's own {script, args, payload} - or \`[]\` for
 * any other event. Exported as a property (never a second named export - F6) so this
 * generated module's own mapping can be asserted without spawning anything, the same seam
 * \`AiddTelemetry.journalCallFor\` already gives opencode-plugin.js. */
function stopCallsFor(event, directory) {
  if (event?.type !== "session.idle") return [];
  const sessionId = event.properties?.sessionID;
  return STOP.map((hook) => ({
    script: hook.script,
    args: hook.args,
    payload: { hook_event_name: "Stop", session_id: sessionId ?? null, cwd: directory },
  }));
}

/** Pure: \`message.part.updated\` for a completed tool part -> every PostToolUse hook whose
 * matcher (absent, or an exact / pipe-separated tool name) allows this tool - or \`[]\` for
 * any other event, an incomplete part, or one naming no tool. */
function postToolUseCallsFor(event, directory) {
  if (event?.type !== "message.part.updated") return [];
  const part = event.properties?.part;
  if (part?.type !== "tool" || part.state?.status !== "completed") return [];
  const toolName = part.tool;
  const sessionId = event.properties?.sessionID;
  const matches = (matcher) => !matcher || matcher.split("|").includes(toolName);
  return POST_TOOL_USE.filter((hook) => matches(hook.matcher)).map((hook) => ({
    script: hook.script,
    args: hook.args,
    payload: {
      hook_event_name: "PostToolUse",
      session_id: sessionId ?? null,
      cwd: directory,
      tool_name: toolName,
      tool_input: part.state.input,
    },
  }));
}

export const ${ident} = async (input) => {
  // SessionStart's own approximation (module doc comment above): fired once here, never
  // per session. Silent on purpose, the same rule journal.cjs's own main() and
  // opencode-plugin.js's own event handler both state: a measurement or a memory refresh
  // that breaks OpenCode's own startup is worse than one that never ran.
  try {
    for (const hook of SESSION_START) {
      runHook(
        hook.script,
        hook.args,
        { hook_event_name: "SessionStart", session_id: null, cwd: input.directory },
        input.directory
      );
    }
  } catch {
    // Silent on purpose - see above.
  }
  return {
    event: async ({ event }) => {
      try {
        const calls = [
          ...stopCallsFor(event, input.directory),
          ...postToolUseCallsFor(event, input.directory),
        ];
        for (const call of calls) {
          runHook(call.script, call.args, call.payload, input.directory);
        }
      } catch {
        // Silent on purpose - see above.
      }
    },
  };
};

${ident}.stopCallsFor = stopCallsFor;
${ident}.postToolUseCallsFor = postToolUseCallsFor;
`;
}

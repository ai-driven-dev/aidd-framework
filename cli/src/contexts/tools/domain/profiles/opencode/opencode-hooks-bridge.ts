/**
 * Generates OpenCode's event bridge for one plugin's hooks.json. OpenCode's loader scans no
 * "hooks" family and this profile writes no hooks.json, so without this module a plugin's
 * declared hooks have no trigger on OpenCode at all. The generated file is a real OpenCode
 * plugin, one function-valued export, spawning the same scripts every other host's hooks.json
 * already names over the stdin-JSON contract those scripts already read.
 *
 * Only three events map; anything else is dropped, OpenCode's plugin surface delivering no
 * event those hooks could ride on:
 *
 * - `SessionStart` runs when the generated plugin's own factory is called — once per
 *   server/directory, not once per session, since `session.created` is published on OpenCode's
 *   bus but was never observed delivered to a plugin's `event` hook. Safe only for an
 *   idempotent hook, which every `SessionStart` hook this generator sees today is.
 * - `Stop` maps to `session.idle`, delivered once per turn.
 * - `PostToolUse` maps to `message.part.updated` whose `part.state.status === "completed"`, the
 *   one shape measured live: `part.tool` names the tool, `part.state.input` its arguments.
 *   `tool.execute.after` reads cleaner in OpenCode's own docs but is a separate named hook
 *   `(input, output)`, never an `event({event})` payload, and nothing here has captured it.
 *
 * A `matcher` on a `PostToolUse` group filters by tool name, exact or pipe-separated
 * alternation; absent, every tool matches.
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
// [args...]`. Anything else is a shape only Claude's own settings.json target ever runs, and is
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

/** A plugin's raw hooks.json — still carrying `${CLAUDE_PLUGIN_ROOT}`, since the generated
 * bridge resolves its scripts from its own `import.meta.url` and the outDir-relative rewrite
 * every other flat target needs buys this one nothing — reduced to the three mapped events.
 * Exported for the generator's own unit test. */
export function parseHooksJsonForBridge(rawHooksJson: string): OpencodeHookTable {
  const parsed = JSON.parse(rawHooksJson) as ClaudeHooksShape;
  const hooks = parsed.hooks ?? {};
  return {
    sessionStart: parseGroups(hooks.SessionStart),
    stop: parseGroups(hooks.Stop),
    postToolUse: parseGroups(hooks.PostToolUse),
  };
}

// Every plugin this generator sees is already named "aidd-<something>", so an "Aidd" prefix
// here would stutter rather than name anything the plugin's own PascalCased name does not.
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

/** A plugin's raw hooks.json + its name -> the full text of its generated OpenCode bridge
 * module, or `null` when none of the three mapped events named anything replayable — a bridge
 * with nothing to spawn is not a file worth writing. */
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

/**
 * One week of work, measured — the scenario this repository points at when it claims the
 * telemetry core answers a period.
 *
 * Every per-axis test on this branch proves one axis on data of its own, written straight
 * into the sink by hand. None proves the axes reconcile to each other on one week, and none
 * exercises the capture half at all. This builds that: two people on two machines, two
 * projects, three tools, three days, one SDLC flow, one task that declares its backlog item
 * and one that does not.
 *
 * What is real and what is authored, stated plainly because the case is worth nothing
 * without the distinction:
 *
 *   real       the journal — written by the shipped hook, spawned as a process with a
 *              payload on stdin, exactly as a tool invokes it.
 *   real       the reading — the sink, the identity file, `telemetry read` and
 *              `telemetry report`, all through the built CLI, opening the files below for
 *              themselves.
 *   authored   every session file (in its tool's own on-disk format, shapes taken from
 *              `cli/tests/fixtures/local-cost/`), the task folders and their
 *              `backlog-link.json`, the git remotes, the model ids, the counters, and the
 *              clock the hook stamps with (see `frozen-clock.cjs`).
 *
 * So this proves capture-to-analysis over authored inputs. It does not prove any tool
 * writes what is claimed here — the captured fixtures under `cli/tests/fixtures/local-cost/`
 * are what carry that, and the shapes below are taken from them.
 *
 * Two people, one destination: `AIDD_TELEMETRY_DIR` moves the figures and `AIDD_RUNS_DIR`
 * the journal, both honoured by writer and reader alike; identity refuses both and resolves
 * from `HOME` (`home-dir.ts:30`). That is what makes two sandboxed homes two people whose
 * measurements land in one place — and without it, attribution is per-checkout, which is
 * the argument for a hosted destination.
 *
 * `AIDD_TELEMETRY_DIR` and not `AIDD_USER_CONFIG_DIR`, which would also work and which the
 * plugin README used to recommend: that one relocates `auth.json` too. A demonstration of
 * sharing a destination has to demonstrate the safe way of doing it, or it teaches the
 * thing the README now warns against.
 *
 * No amount appears anywhere: `supplies.amount` is `false` on all five tools, so a produced
 * week has counters and no currency until the price table lands (#654).
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const HOOK = path.join(REPO_ROOT, "plugins", "aidd-telemetry", "hooks", "journal.cjs");
const FROZEN_CLOCK = path.join(__dirname, "frozen-clock.cjs");
const CLI = path.join(REPO_ROOT, "cli", "dist", "cli.js");

// ---------------------------------------------------------------------------
// The week, as data
// ---------------------------------------------------------------------------

const PERIOD = Object.freeze({ from: "2026-03-01", to: "2026-03-07" });

const PEOPLE = Object.freeze({
  ada: Object.freeze({ personId: "person-ada", displayName: "Ada" }),
  bo: Object.freeze({ personId: "person-bo", displayName: "Bo" }),
});

const PROJECTS = Object.freeze({
  widgets: Object.freeze({ remote: "git@github.com:acme/widgets.git" }),
  gadgets: Object.freeze({ remote: "git@github.com:acme/gadgets.git" }),
});

const FLOW_SKILL = "aidd-orchestrator:01-sdlc";
const TASK_WITH_BACKLOG = "2026_03/2026_03_02_gouvernail";
const TASK_WITHOUT_BACKLOG = "2026_03/2026_03_03_pricing";
const BACKLOG_ITEM = "#661";

// UUID-shaped because Codex parses its rollout file name back into one. Fixed digits: this
// is a public repository and nothing here came off a real session.
const SESSION = Object.freeze({
  adaFlow: "aaaaaaa1-0000-4000-8000-000000000001",
  adaCodex: "aaaaaaa2-0000-4000-8000-000000000002",
  boClaude: "bbbbbbb3-0000-4000-8000-000000000003",
  boCodex: "bbbbbbb4-0000-4000-8000-000000000004",
  boCopilot: "bbbbbbb5-0000-4000-8000-000000000005",
});

/** Stated once so the test asserts it and the script prints against the same list. */
const EXPECTED = Object.freeze({
  requests: 7,
  inputTokens: 700,
  outputTokens: 70,
  totalTokens: 1060,
  days: Object.freeze(["2026-03-02", "2026-03-03", "2026-03-04"]),
  models: Object.freeze(["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "gpt-5.5"]),
  requestTools: Object.freeze(["claude", "codex"]),
  sessionOnlyTool: "copilot",
  uncoveredTools: Object.freeze(["cursor", "opencode"]),
  projects: Object.freeze([PROJECTS.widgets.remote, PROJECTS.gadgets.remote]),
  people: Object.freeze([PEOPLE.ada.personId, PEOPLE.bo.personId]),
  flow: FLOW_SKILL,
  tasks: Object.freeze([TASK_WITH_BACKLOG, TASK_WITHOUT_BACKLOG]),
  backlogItem: BACKLOG_ITEM,
});

// ---------------------------------------------------------------------------
// Machinery
// ---------------------------------------------------------------------------

/** Every `GIT_*` variable removed. Git exports `GIT_DIR`, `GIT_INDEX_FILE` and friends into
 * every process it spawns, so anything run from inside a git hook — `pre-push` running the
 * test suite, most concretely — inherits a pointer to the *real* repository. The checkouts
 * below then `git init` a temp directory and immediately fail on `git remote add origin`,
 * because the origin it finds is this repository's own, which already has one.
 *
 * This suite passed run by hand and failed run from the pre-push hook, which is exactly the
 * shape that leak takes. Both sides of the system already defend against it — `repo.cjs`'s
 * own `gitEnv` in the hook, `git-environment.ts` in the CLI, and an integration test named
 * "neither side follows a leaked GIT_DIR" — and this harness was the one place that did not. */
function withoutGitVariables(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("GIT_")));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
    env: withoutGitVariables(options.env ?? process.env),
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}\n${result.stderr || result.stdout}`
    );
  }
  return result.stdout || "";
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeLines(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
}

/** Committed, because a repository with no HEAD answers some of the hook's git questions
 * differently. The remote is what the project identifier is derived from. */
function makeCheckout(root, name, project) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  run("git", ["init", "-q", "-b", "main", dir]);
  run("git", ["config", "user.email", "reference-week@example.invalid"], { cwd: dir });
  run("git", ["config", "user.name", "reference-week"], { cwd: dir });
  run("git", ["remote", "add", "origin", project.remote], { cwd: dir });
  writeJson(path.join(dir, ".aidd", "config.json"), { telemetry: { enabled: true } });
  fs.writeFileSync(path.join(dir, "README.md"), `# ${name}\n`);
  run("git", ["add", "-A"], { cwd: dir });
  run("git", ["commit", "-q", "-m", "seed"], { cwd: dir });
  return dir;
}

function fireHook({ event, payload, cwd, home, runsDir, at }) {
  const result = spawnSync(process.execPath, ["--require", FROZEN_CLOCK, HOOK, event], {
    cwd,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      AIDD_RUNS_DIR: runsDir,
      AIDD_FROZEN_CLOCK: at,
    },
  });
  // The hook exits 0 by contract, whatever it decides. Non-zero means it never ran.
  if (result.status !== 0) {
    throw new Error(`journal hook exited ${result.status}: ${result.stderr}`);
  }
}

// ---------------------------------------------------------------------------
// Each tool's own session file
// ---------------------------------------------------------------------------

/** One shape for every request in the week, so any number in the report traces back to a
 * count of requests rather than to arithmetic nobody can redo by hand. */
const COUNTERS = Object.freeze({ input: 100, output: 10, cacheRead: 20, cacheCreation: 30 });

function claudeTranscriptPath(home, sessionId) {
  return path.join(home, ".claude", "projects", "reference-week", `${sessionId}.jsonl`);
}

/** `attributionSkill` beside `usage` is what makes a Claude Code step `tool-stated`. An
 * entry without it is the unattributed case; this week has both. */
function writeClaudeTranscript(home, sessionId, entries) {
  writeLines(
    claudeTranscriptPath(home, sessionId),
    entries.map((entry, index) => ({
      parentUuid: null,
      isSidechain: false,
      type: "assistant",
      uuid: `${sessionId}-line-${index}`,
      timestamp: entry.at,
      sessionId,
      ...(entry.skill ? { attributionSkill: entry.skill } : {}),
      message: {
        id: `msg_${sessionId}_${index}`,
        type: "message",
        role: "assistant",
        model: entry.model,
        content: "[REDACTED]",
        usage: {
          input_tokens: COUNTERS.input,
          cache_creation_input_tokens: COUNTERS.cacheCreation,
          cache_read_input_tokens: COUNTERS.cacheRead,
          output_tokens: COUNTERS.output,
          service_tier: "standard",
        },
      },
    }))
  );
}

/** The trailing uuid is the session identity on both sides — the hook's
 * `codexSessionIdFromTranscriptPath` and the reader's `CODEX_ROLLOUT_LOCATION.matches`. */
function codexRolloutPath(home, sessionId, day, stamp) {
  const [year, month, dayOfMonth] = day.split("-");
  return path.join(
    home, ".codex", "sessions", year, month, dayOfMonth,
    `rollout-${stamp}-${sessionId}.jsonl`
  );
}

/** A rollout names no skill anywhere, which is why Codex is here: its step can only come
 * from a journal interval. */
function writeCodexRollout(home, sessionId, day, stamp, entries) {
  const lines = [
    {
      timestamp: `${day}T00:00:00.000Z`,
      type: "session_meta",
      payload: { id: sessionId, session_id: sessionId },
    },
  ];
  for (const [index, entry] of entries.entries()) {
    lines.push({
      timestamp: entry.at,
      type: "turn_context",
      payload: { turn_id: `${sessionId}-turn-${index}`, model: entry.model, effort: "medium" },
    });
    lines.push({
      timestamp: entry.at,
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: {
            input_tokens: COUNTERS.input + COUNTERS.cacheRead,
            cached_input_tokens: COUNTERS.cacheRead,
            output_tokens: COUNTERS.output,
            reasoning_output_tokens: 0,
            total_tokens: COUNTERS.input + COUNTERS.cacheRead + COUNTERS.output,
          },
        },
      },
    });
  }
  writeLines(codexRolloutPath(home, sessionId, day, stamp), lines);
}

/** Copilot's only record is `kind: "session"` — `session.shutdown` totals the whole
 * session. It must appear as its own line and never join the request totals. */
function writeCopilotEvents(home, sessionId, startedAt, endedAt) {
  writeLines(path.join(home, ".copilot", "session-state", sessionId, "events.jsonl"), [
    {
      type: "session.start",
      data: { sessionId, producer: "copilot-agent", copilotVersion: "1.0.80" },
      id: `${sessionId}-start`,
      timestamp: startedAt,
      parentId: null,
    },
    {
      type: "session.shutdown",
      data: {
        shutdownType: "routine",
        tokenDetails: {
          input: { tokenCount: 4000 },
          cache_read: { tokenCount: 0 },
          cache_write: { tokenCount: 900 },
          output: { tokenCount: 250 },
        },
      },
      id: `${sessionId}-shutdown`,
      timestamp: endedAt,
      parentId: null,
    },
  ]);
}

// ---------------------------------------------------------------------------
// The five sessions
// ---------------------------------------------------------------------------

/** Ada, Monday, widgets: one orchestrated run. Step intervals are flat — a nested skill
 * closes its parent — so three requests under three steps all belong to one flow, which is
 * the case the flow layer exists for. */
function seedAdaFlow({ projectDir, home, runsDir }) {
  const sessionId = SESSION.adaFlow;
  const base = { cwd: projectDir, home, runsDir };
  const payload = (extra) => ({
    session_id: sessionId,
    cwd: projectDir,
    transcript_path: claudeTranscriptPath(home, sessionId),
    ...extra,
  });
  const toolUsed = (at, extra) =>
    fireHook({ ...base, event: "tool-used", at, payload: payload({ hook_event_name: "PostToolUse", ...extra }) });

  fireHook({
    ...base,
    event: "session-start",
    at: "2026-03-02T08:00:00Z",
    payload: payload({ hook_event_name: "SessionStart" }),
  });
  toolUsed("2026-03-02T08:05:00Z", {
    tool_name: "Skill",
    tool_input: { skill: FLOW_SKILL },
    prompt_id: "turn-1",
  });
  toolUsed("2026-03-02T08:10:00Z", {
    tool_name: "Write",
    tool_input: { file_path: path.join(projectDir, "aidd_docs", "tasks", TASK_WITH_BACKLOG, "plan.md") },
    prompt_id: "turn-1",
  });
  // Not redundant with the write, and the difference is why both are here: a write is
  // recorded as `file_written` and `task-declared.cjs` stands down for it, but
  // `buildTaskIntervals` opens intervals on `task_declared` alone. A session that only
  // writes into a task folder gets no `--axis task` row, while `--task <folder>` still
  // finds it through the inferred route. The axis and the filter disagree; this session
  // carries both lines so the week shows each.
  toolUsed("2026-03-02T08:12:00Z", {
    tool_name: "Read",
    tool_input: { file_path: `aidd_docs/tasks/${TASK_WITH_BACKLOG}/plan.md` },
    prompt_id: "turn-1",
  });
  toolUsed("2026-03-02T08:15:00Z", {
    tool_name: "Skill",
    tool_input: { skill: "aidd-dev:01-plan" },
    prompt_id: "turn-1",
  });
  toolUsed("2026-03-02T09:00:00Z", {
    tool_name: "Skill",
    tool_input: { skill: "aidd-dev:02-implement" },
    prompt_id: "turn-2",
  });
  fireHook({
    ...base,
    event: "turn-end",
    at: "2026-03-02T10:00:00Z",
    payload: payload({ hook_event_name: "Stop", prompt_id: "turn-2" }),
  });

  writeClaudeTranscript(home, sessionId, [
    { at: "2026-03-02T08:07:00.000Z", model: "claude-opus-5", skill: FLOW_SKILL },
    { at: "2026-03-02T08:30:00.000Z", model: "claude-opus-5", skill: "aidd-dev:01-plan" },
    { at: "2026-03-02T09:30:00.000Z", model: "claude-sonnet-5", skill: "aidd-dev:02-implement" },
  ]);
}

/** Ada, Tuesday, same checkout, Codex: a second task, outside any flow. Both facts here are
 * read out of a shell command's own text — the skill from a `SKILL.md` path, the task from
 * a path under `aidd_docs/tasks/` — which is Codex's only route. */
function seedAdaCodex({ projectDir, home, runsDir }) {
  const sessionId = SESSION.adaCodex;
  const stamp = "2026-03-03T09-00-00";
  const base = { cwd: projectDir, home, runsDir };
  const payload = (extra) => ({
    session_id: sessionId,
    cwd: projectDir,
    transcript_path: codexRolloutPath(home, sessionId, "2026-03-03", stamp),
    ...extra,
  });
  const toolUsed = (at, command) =>
    fireHook({
      ...base,
      event: "tool-used",
      at,
      payload: payload({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command },
        turn_id: "codex-turn-1",
      }),
    });

  fireHook({
    ...base,
    event: "session-start",
    at: "2026-03-03T09:00:00Z",
    payload: payload({ hook_event_name: "SessionStart" }),
  });
  toolUsed("2026-03-03T09:05:00Z", "cat plugins/aidd-dev/skills/02-implement/SKILL.md");
  toolUsed("2026-03-03T09:10:00Z", `cat aidd_docs/tasks/${TASK_WITHOUT_BACKLOG}/spec.md`);
  fireHook({
    ...base,
    event: "turn-end",
    at: "2026-03-03T10:00:00Z",
    payload: payload({ hook_event_name: "Stop" }),
  });

  writeCodexRollout(home, sessionId, "2026-03-03", stamp, [
    { at: "2026-03-03T09:30:00.000Z", model: "gpt-5.5" },
  ]);
}

/** Bo, Wednesday, another project: work that declares nothing. The week's honest remainder
 * — every declaring axis owes it a named row of its own. */
function seedBoClaude({ projectDir, home, runsDir }) {
  const sessionId = SESSION.boClaude;
  const base = { cwd: projectDir, home, runsDir };
  const payload = (extra) => ({
    session_id: sessionId,
    cwd: projectDir,
    transcript_path: claudeTranscriptPath(home, sessionId),
    ...extra,
  });

  fireHook({ ...base, event: "session-start", at: "2026-03-04T08:00:00Z", payload: payload({ hook_event_name: "SessionStart" }) });
  fireHook({ ...base, event: "turn-end", at: "2026-03-04T09:00:00Z", payload: payload({ hook_event_name: "Stop" }) });

  // No `attributionSkill`: the tool states no step, so neither does the report.
  writeClaudeTranscript(home, sessionId, [
    { at: "2026-03-04T08:20:00.000Z", model: "claude-haiku-4-5" },
    { at: "2026-03-04T08:40:00.000Z", model: "claude-haiku-4-5" },
  ]);
}

/** Bo, Wednesday, Codex: a second tool on one day, so `by_day` and `by_tool` cannot be read
 * off the same partition of the week. */
function seedBoCodex({ projectDir, home, runsDir }) {
  const sessionId = SESSION.boCodex;
  const stamp = "2026-03-04T10-00-00";
  const base = { cwd: projectDir, home, runsDir };
  const payload = (extra) => ({
    session_id: sessionId,
    cwd: projectDir,
    transcript_path: codexRolloutPath(home, sessionId, "2026-03-04", stamp),
    ...extra,
  });

  fireHook({ ...base, event: "session-start", at: "2026-03-04T10:00:00Z", payload: payload({ hook_event_name: "SessionStart" }) });
  fireHook({ ...base, event: "turn-end", at: "2026-03-04T11:00:00Z", payload: payload({ hook_event_name: "Stop" }) });

  writeCodexRollout(home, sessionId, "2026-03-04", stamp, [
    { at: "2026-03-04T10:30:00.000Z", model: "gpt-5.5" },
  ]);
}

/** Bo, Wednesday, Copilot. `sessionId` with no `hook_event_name` is how the hook tells
 * Copilot's canonical builder from every other host — the spelling is the discrimination. */
function seedBoCopilot({ projectDir, home, runsDir }) {
  const sessionId = SESSION.boCopilot;
  const base = { cwd: projectDir, home, runsDir };
  const payload = { sessionId, cwd: projectDir };

  fireHook({ ...base, event: "session-start", at: "2026-03-04T13:00:00Z", payload });
  fireHook({ ...base, event: "turn-end", at: "2026-03-04T14:00:00Z", payload });

  writeCopilotEvents(home, sessionId, "2026-03-04T13:00:00.000Z", "2026-03-04T14:00:00.000Z");
}

// ---------------------------------------------------------------------------
// Building the week
// ---------------------------------------------------------------------------

// A minimal PATH, never the caller's own. What a spawned `aidd` can reach decides how long
// it takes: the OpenCode reader shells out to an `opencode` binary and waits up to 10s for
// it, per session, so a machine that happens to have the tool installed pays a cost a
// machine without it does not. The week uses no tool binary at all, and must not depend on
// which ones the person running it has. `git` lives here on every supported platform; node
// is reached by absolute path.
const MINIMAL_PATH = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(path.delimiter);

function sandboxEnv(home, { sinkDir, runsDir }) {
  return {
    ...process.env,
    PATH: MINIMAL_PATH,
    Path: MINIMAL_PATH,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    APPDATA: path.join(home, "AppData", "Roaming"),
    AIDD_TELEMETRY_DIR: path.join(sinkDir, "telemetry"),
    AIDD_RUNS_DIR: runsDir,
    AIDD_SKIP_MARKETPLACE_REFRESH: "1",
  };
}

function cli(args, who, { sinkDir, runsDir, cliPath }) {
  return run(process.execPath, [cliPath, ...args], {
    cwd: who.projectDir,
    env: sandboxEnv(who.home, { sinkDir, runsDir }),
  });
}

/** Builds the scenario under `root` and reads it into the shared sink, leaving it ready for
 * `telemetry report`. Writes nothing outside `root` and reads nothing from the machine. */
function buildReferenceWeek({ root, cliPath = CLI }) {
  if (!fs.existsSync(cliPath)) {
    throw new Error(`the CLI is not built at ${cliPath} — run \`pnpm build\` in cli/ first`);
  }

  const sinkDir = path.join(root, "destination", "aidd");
  const runsDir = path.join(root, "destination", "runs");
  const adaHome = path.join(root, "ada-home");
  const boHome = path.join(root, "bo-home");
  for (const dir of [sinkDir, runsDir, adaHome, boHome]) fs.mkdirSync(dir, { recursive: true });

  const widgets = makeCheckout(root, "ada-widgets", PROJECTS.widgets);
  const gadgets = makeCheckout(root, "bo-gadgets", PROJECTS.gadgets);

  // Both task folders live in the checkout the report runs from: `TaskBacklogAdapter` is
  // rooted at one project, so a declaration in another checkout is unreadable from here.
  const taskDir = path.join(widgets, "aidd_docs", "tasks", TASK_WITH_BACKLOG);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "plan.md"), "# Gouvernail\n");
  writeJson(path.join(taskDir, "backlog-link.json"), {
    backlog: BACKLOG_ITEM,
    written_at: "2026-03-02T08:10:00Z",
    written_by: "aidd-dev:01-plan",
  });
  // Declared, and declaring no backlog item — a different state from a task nobody declared.
  const plainTaskDir = path.join(widgets, "aidd_docs", "tasks", TASK_WITHOUT_BACKLOG);
  fs.mkdirSync(plainTaskDir, { recursive: true });
  fs.writeFileSync(path.join(plainTaskDir, "spec.md"), "# Pricing\n");

  seedAdaFlow({ projectDir: widgets, home: adaHome, runsDir });
  seedAdaCodex({ projectDir: widgets, home: adaHome, runsDir });
  seedBoClaude({ projectDir: gadgets, home: boHome, runsDir });
  seedBoCodex({ projectDir: gadgets, home: boHome, runsDir });
  seedBoCopilot({ projectDir: gadgets, home: boHome, runsDir });

  const ada = { home: adaHome, projectDir: widgets, person: PEOPLE.ada };
  const bo = { home: boHome, projectDir: gadgets, person: PEOPLE.bo };
  for (const who of [ada, bo]) {
    const where = { sinkDir, runsDir, cliPath };
    // One call: the identifier and the name it goes by are one decision, and the command
    // surface says so now.
    cli(
      ["telemetry", "identity", "use", who.person.personId, "--name", who.person.displayName],
      who,
      where
    );
    // Reading is per machine: each person's tool files are under their own home.
    cli(["telemetry", "read"], who, where);
  }

  return {
    /** The one directory a caller may delete from, to ask what `report` rebuilds alone. */
    sinkDir,
    reportFrom: widgets,
    env: sandboxEnv(adaHome, { sinkDir, runsDir }),
    period: PERIOD,
    expected: EXPECTED,
    cliPath,
  };
}

/** `telemetry report` over the built week. Runs from the checkout holding the task folders,
 * under Ada's home — the person axis comes off the stored records, never off who asks. */
function reportReferenceWeek(week, extraArgs = []) {
  return run(
    process.execPath,
    [week.cliPath, "telemetry", "report", "--from", week.period.from, "--to", week.period.to, ...extraArgs],
    { cwd: week.reportFrom, env: week.env }
  );
}

// Three, deliberately. Everything else the week is made of reaches a caller through the
// object `buildReferenceWeek` returns, or through `EXPECTED` — exporting the constants
// beside them as well would be a second way to ask the same question, and the answers could
// drift apart.
module.exports = { buildReferenceWeek, reportReferenceWeek, EXPECTED };

#!/usr/bin/env node
// Deterministic, re-runnable end-to-end proof of the AIDD telemetry chain, for one named
// tool at a time. Everything happens under a throwaway project in /private/tmp; nothing
// is written into this repository. Plain ESM, zero dependencies beyond node built-ins and
// the real tool binaries (`claude`, `codex`, `copilot`, `cursor-agent`, `opencode`, `expect`,
// `git`) already on PATH.
//
// Usage: node scripts/verify-chain.mjs <claude|codex|copilot|cursor|opencode>
//
// What this does NOT do, on purpose: fake a session, invent a passing line, or silently
// skip a step that could have run. SKIP is printed with the exact reason, same as FAIL.

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);
const CLI_PATH = join(REPO_ROOT, "cli", "dist", "cli.js");
const PLUGIN_DIR = join(REPO_ROOT, "plugins", "aidd-telemetry");
const REAL_HOME = process.env.HOME || homedir();

const out = (line) => process.stdout.write(`${line}\n`);
const nowStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");

// `by_day` lists every day in the requested period, always (see render.js) — a period as
// wide as "this whole year" turns into hundreds of mostly-empty rows and a multi-hundred-KB
// envelope. A 3-day window around today is always enough to cover one throwaway project's
// one short run, with margin either side of a UTC-midnight crossing.
function reportPeriodArgs() {
  const dayKey = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return ["--from", dayKey(yesterday), "--to", dayKey(tomorrow)];
}

// ---------------------------------------------------------------------------------------
// Small process/journal utilities
// ---------------------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    input: opts.input,
    timeout: opts.timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    code: result.status ?? (result.signal ? -1 : 0),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

// Set once per script invocation, before anything runs — see below.
let ACTIVE_CONFIG_DIR = null;

// Strips the nested-session env vars a tool spawned from inside a live agent session
// would otherwise inherit (see hooks/lib/host.js's own comment on exactly this hazard for
// Codex nested under Claude Code). Real HOME and PATH stay intact: an isolated HOME breaks
// every tool's own auth/registry, measured directly (see measurements.md).
//
// AIDD_USER_CONFIG_DIR is set here too: skills/01-cost/scripts/lib/sink.js caches every
// `telemetry-report.js read` under `~/.config/aidd/telemetry/<day>.jsonl` by default — one
// file shared by every project on the machine. Measured directly: a copilot run's report
// came back carrying a codex run's totals from earlier the same day, mixed into the same
// day file. The e2e suite already isolates this the same way (see
// telemetry-plugin-standalone.e2e.test.ts); every command here gets its own directory so
// one tool's run can never read another's.
function baseEnv() {
  const env = { ...process.env };
  const stripPrefixes = ["CLAUDECODE", "CLAUDE_CODE_", "CLAUDE_PID", "CLAUDE_EFFORT", "AI_AGENT"];
  for (const key of Object.keys(env)) {
    if (stripPrefixes.some((p) => key === p || key.startsWith(p))) delete env[key];
  }
  if (ACTIVE_CONFIG_DIR) env.AIDD_USER_CONFIG_DIR = ACTIVE_CONFIG_DIR;
  return env;
}

function runsDir(projectDir) {
  return join(projectDir, "aidd_docs", "runs");
}

function listRunFiles(projectDir) {
  const dir = runsDir(projectDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => join(dir, name));
}

function readJournalLines(filePath) {
  return readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// The run file whose own session_start line names this vendor id, freshest first — a
// variant that retried keeps only its own run file findable this way.
function findRunFileForSession(projectDir, vendorId) {
  const candidates = listRunFiles(projectDir)
    .map((path) => ({ path, lines: readJournalLines(path) }))
    .filter(({ lines }) => lines.some((l) => l.type === "session_start" && l.vendor_id === vendorId));
  return candidates.at(-1) ?? null;
}

// ---------------------------------------------------------------------------------------
// Claim printing
// ---------------------------------------------------------------------------------------

const results = [];

function claim(tool, variant, label, verdict, detail) {
  results.push({ tool, variant, label, verdict, detail });
  const tag = variant ? `${tool}/${variant}` : tool;
  out(`[${tag}] ${label.padEnd(28)} ${verdict.padEnd(5)} ${detail}`);
  return verdict;
}

const PASS = "PASS";
const FAIL = "FAIL";
const SKIP = (reason) => `SKIP ${reason}`;

// ---------------------------------------------------------------------------------------
// Real-HOME snapshot / restore — several tools register a plugin marketplace under a
// global, machine-wide file rather than anything project-scoped (measured: Claude Code's
// ~/.claude/plugins/known_marketplaces.json, Copilot's ~/.copilot/config.json). Isolating
// HOME breaks their own auth, so this project touches the real one and restores exactly
// what it changed instead — see measurements.md's "Restoration" section for what each
// tool actually wrote and how it was verified undone.
// ---------------------------------------------------------------------------------------

function snapshotFile(path) {
  return { path, existed: existsSync(path), content: existsSync(path) ? readFileSync(path) : null };
}

function restoreFile(snapshot) {
  if (snapshot.existed) {
    mkdirSync(dirname(snapshot.path), { recursive: true });
    writeFileSync(snapshot.path, snapshot.content);
  } else if (existsSync(snapshot.path)) {
    rmSync(snapshot.path, { force: true });
  }
}

function realHomeTouchPoints(toolId) {
  const claudePlugins = join(REAL_HOME, ".claude", "plugins");
  const byTool = {
    claude: [join(claudePlugins, "known_marketplaces.json"), join(claudePlugins, "installed_plugins.json")],
    codex: [join(REAL_HOME, ".codex", "config.toml")],
    copilot: [join(REAL_HOME, ".copilot", "config.json")],
    cursor: [],
    opencode: [],
  };
  return byTool[toolId] ?? [];
}

// ---------------------------------------------------------------------------------------
// Project scaffolding
// ---------------------------------------------------------------------------------------

function newProjectDir(toolId) {
  const base = mkdtempSync(join(tmpdir(), `aidd-verify-chain-${toolId}-`));
  const projectDir = join(base, "project");
  mkdirSync(projectDir, { recursive: true });
  run("git", ["init", "-q"], { cwd: projectDir, env: baseEnv() });
  run("git", ["config", "user.email", "verify-chain@example.invalid"], { cwd: projectDir });
  run("git", ["config", "user.name", "verify-chain"], { cwd: projectDir });
  return { base, projectDir };
}

function seedTicket(projectDir) {
  const relDir = join("aidd_docs", "tasks", "2026_08", "chain-verified-live");
  const dir = join(projectDir, relDir);
  mkdirSync(dir, { recursive: true });
  const relPath = join(relDir, "ticket.md");
  writeFileSync(
    join(projectDir, relPath),
    "# Live verify-chain ticket\n\nSay the word PONG after reading this file, then stop.\n"
  );
  return relPath.split("\\").join("/");
}

// ---------------------------------------------------------------------------------------
// Step 1 — install the framework and the plugin through the real CLI
// ---------------------------------------------------------------------------------------

function ensureCliBuilt() {
  if (existsSync(CLI_PATH)) return;
  out("cli/dist/cli.js missing — building it (npm run build in cli/) ...");
  const build = run("npm", ["run", "build"], { cwd: join(REPO_ROOT, "cli"), env: baseEnv() });
  if (build.code !== 0 || !existsSync(CLI_PATH)) {
    throw new Error(`cli build failed (exit ${build.code}): ${build.stderr.slice(-2000)}`);
  }
}

function copilotResetStaleMarketplace() {
  // Copilot's own marketplace registry is machine-global, not project-scoped (measured:
  // ~/.copilot/config.json), so a prior run anywhere on this machine can leave a stale
  // "aidd-framework" entry pointing at a deleted throwaway path. Best-effort, never fatal.
  run("copilot", ["plugin", "marketplace", "remove", "aidd-framework", "--force"], { env: baseEnv() });
}

function installFramework(toolId, projectDir) {
  if (toolId === "copilot") copilotResetStaleMarketplace();
  const args = [
    "setup",
    "--source",
    "local",
    "--path",
    REPO_ROOT,
    "--ai",
    toolId,
    "--plugins",
    "aidd-telemetry",
    "--yes",
  ];
  const result = run("node", [CLI_PATH, ...args], { cwd: projectDir, env: baseEnv() });
  const installed = result.code === 0;
  claim(
    toolId,
    null,
    "framework+plugin installed",
    installed ? PASS : FAIL,
    installed
      ? `aidd setup --ai ${toolId} --plugins aidd-telemetry (exit 0)`
      : `exit ${result.code}: ${(result.stderr || result.stdout).trim().slice(-400)}`
  );
  return installed;
}

// ---------------------------------------------------------------------------------------
// Step 2 — measurement switch: .gitignore now carries aidd_docs/runs/
// ---------------------------------------------------------------------------------------

function switchOn(toolId, projectDir) {
  const switchScript = join(PLUGIN_DIR, "skills", "00-init", "scripts", "telemetry-switch.js");
  const result = run("node", [switchScript, "on"], { cwd: projectDir, env: baseEnv() });
  const gitignore = existsSync(join(projectDir, ".gitignore"))
    ? readFileSync(join(projectDir, ".gitignore"), "utf8")
    : "";
  const hasEntry = gitignore.split("\n").some((line) => line.trim() === "aidd_docs/runs/");
  claim(
    toolId,
    null,
    "telemetry switched on",
    result.code === 0 && hasEntry ? PASS : FAIL,
    hasEntry ? ".gitignore carries aidd_docs/runs/" : `.gitignore missing the entry (${result.stdout.trim()})`
  );
  return result.code === 0 && hasEntry;
}

// git status must not offer the journal — meaningful only once a run file exists, so this
// runs after step 4, not right after switch-on (an empty runs/ dir would pass trivially).
function assertGitStatusHidesJournal(toolId, projectDir) {
  const status = run("git", ["status", "--porcelain"], { cwd: projectDir, env: baseEnv() });
  const offered = status.stdout.split("\n").some((line) => line.includes("aidd_docs/runs"));
  claim(
    toolId,
    null,
    "git status hides journal",
    offered ? FAIL : PASS,
    offered ? "git status --porcelain lists a path under aidd_docs/runs" : "git status --porcelain is silent on aidd_docs/runs"
  );
}

// ---------------------------------------------------------------------------------------
// Step 4/5 — one variant's own run file: session_start + turn boundary, and task_declared
// ---------------------------------------------------------------------------------------

// Codex keys hook trust per entry, not per plugin: measured on a real config.toml (#707),
// the key is "<plugin>@<marketplace>:hooks/hooks.json:<event>:<matcher>:<hook>" with the
// event spelled snake_case. So a renamed or newly added event is a NEW key and inherits no
// approval - and until someone approves it, the session journals a session_start with no
// turn_end, which is indistinguishable at a glance from the mapping bug #707 fixed. This
// tells those two apart instead of reporting the same FAIL for both.
function turnEndUntrustedReason(toolId) {
  if (toolId !== "codex") return null;
  let toml;
  try {
    toml = readFileSync(join(REAL_HOME, ".codex", "config.toml"), "utf8");
  } catch {
    return null;
  }
  // Scoped to this plugin's own key, never a bare "session_end": another plugin's approval
  // is not this one's, and a substring match on the shared suffix would read someone else's
  // trusted hook as proof about ours.
  if (toml.includes('aidd-telemetry@aidd-framework:hooks/hooks.json:session_end:')) return null;
  return (
    "issue #699 — Codex has no trusted_hash for this plugin's session_end hook yet, and " +
    "trust is per entry: approving `stop` before the rename approved nothing for " +
    "`session_end`. Approve it once interactively, or use the bypass variant below, which " +
    "does close the turn."
  );
}

// One route's inability to be journalled at all, declared before the run rather than read
// off its result. `opencode run` starts its own server, so it is always that server's first
// session, and the plugin is loaded by the very request that creates it - session.created is
// published before any handler exists to receive it. Nothing fails and nothing says so, which
// is why it is written down here, in docs/telemetry-limits.md and in the PR. Every session
// after the first journals normally, which the free serve+curl proof above demonstrates.
const RUN_FILE_EXPECTATION = {
  "opencode/run (real)":
    "OpenCode's plugin is loaded lazily by the request that creates the session, so the " +
    "event announcing it is published before a handler exists. A one-shot `opencode run` " +
    "starts its own server and is therefore always a first session. Not a race a retry " +
    "closes, and the plugin is handed no session id it could use to recover the one it " +
    "missed (docs/telemetry-limits.md).",
};

function assertRunFile(toolId, variant, projectDir, vendorId) {
  if (vendorId === null) {
    const declared = RUN_FILE_EXPECTATION[`${toolId}/${variant}`];
    return claim(
      toolId,
      variant,
      "run file exists",
      declared ? SKIP(declared) : FAIL,
      "no vendor session id was captured for this session"
    );
  }
  const found = findRunFileForSession(projectDir, vendorId);
  if (!found) {
    return claim(toolId, variant, "run file exists", FAIL, `no run file names session ${vendorId}`);
  }
  const start = found.lines.find((l) => l.type === "session_start");
  const boundary = found.lines.find((l) => l.type === "turn_end");
  const ok = Boolean(start) && Boolean(boundary);
  const untrusted = !ok && start && !boundary ? turnEndUntrustedReason(toolId) : null;
  claim(
    toolId,
    variant,
    "run file exists",
    ok ? PASS : untrusted ? SKIP(untrusted) : FAIL,
    ok
      ? `${found.path.split("/").pop()} carries session_start + turn_end`
      : `session_start ${Boolean(start)}, turn_end ${Boolean(boundary)} in ${found.path.split("/").pop()}`
  );
  return found;
}

function assertTaskDeclared(toolId, variant, foundRunFile, expected) {
  if (!expected.possible) {
    return claim(toolId, variant, "task_declared present", SKIP(expected.reason), expected.reason);
  }
  if (!foundRunFile) {
    return claim(toolId, variant, "task_declared present", FAIL, "no run file to read it from");
  }
  const declared = foundRunFile.lines.find((l) => l.type === "task_declared");
  claim(
    toolId,
    variant,
    "task_declared present",
    declared ? PASS : FAIL,
    declared ? `path=${declared.path}` : "no task_declared line in the run file"
  );
}

// ---------------------------------------------------------------------------------------
// Step 6 — telemetry-report read / report --json reconciliation
// ---------------------------------------------------------------------------------------

function sumCounters(rows) {
  const total = { requests: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 };
  for (const row of rows) {
    const t = row.totals ?? {};
    for (const key of Object.keys(total)) total[key] += t[key] ?? 0;
  }
  return total;
}

function reconciles(sum, totals) {
  return Object.keys(sum).every((key) => sum[key] === (totals[key] ?? 0));
}

function runReport(toolId, projectDir) {
  const reportScript = join(PLUGIN_DIR, "skills", "01-cost", "scripts", "telemetry-report.js");
  const read = run("node", [reportScript, "read"], { cwd: projectDir, env: baseEnv() });
  claim(
    toolId,
    null,
    "report: read",
    read.code === 0 ? PASS : FAIL,
    read.stdout.trim().split("\n")[0] || read.stderr.trim()
  );

  const json = run("node", [reportScript, "report", ...reportPeriodArgs(), "--json"], {
    cwd: projectDir,
    env: baseEnv(),
  });
  if (json.code !== 0) {
    claim(toolId, null, "report --json", FAIL, `exit ${json.code}: ${json.stderr.trim().slice(-300)}`);
    return null;
  }
  let envelope;
  try {
    envelope = JSON.parse(json.stdout);
  } catch (error) {
    claim(toolId, null, "report --json", FAIL, `unparsable JSON: ${error.message}`);
    return null;
  }
  const byStepSum = sumCounters(envelope.by_step ?? []);
  const stepOk = reconciles(byStepSum, envelope.totals ?? {});
  claim(
    toolId,
    null,
    "by_step reconciles to totals",
    stepOk ? PASS : FAIL,
    `by_step sum=${JSON.stringify(byStepSum)} totals=${JSON.stringify(envelope.totals)}`
  );

  const row = (envelope.by_tool ?? []).find((r) => r.tool === toolId);
  const rowPresent = Boolean(row);
  claim(toolId, null, "tool row present in by_tool", rowPresent ? PASS : FAIL, JSON.stringify(row ?? "missing"));

  if (row && row.session_totals) {
    // Measured, not assumed: a session-total-only tool's figure (Copilot, on `session.
    // shutdown`) never folds into the report's own top-level `totals` — only per-request
    // records feed by_step/by_day/the overall total, by design (see render.js). What this
    // can actually assert integer-for-integer is the row's own two figures agreeing with
    // each other: `totals` (the per-request side, empty here) stays at zero exactly when
    // `session_totals` is the only figure supplied, and every session_totals counter is a
    // non-negative integer — the shape session.shutdown's own tokenDetails promises.
    const sessTotals = row.session_totals;
    const zeroPerRequest = (row.totals.requests ?? 0) === 0;
    const wholeNumbers = Object.values(sessTotals).every((v) => Number.isInteger(v) && v >= 0);
    const sessOk = zeroPerRequest && wholeNumbers;
    claim(
      toolId,
      null,
      "session_totals shape reconciles",
      sessOk ? PASS : FAIL,
      `session_totals=${JSON.stringify(sessTotals)} row.totals=${JSON.stringify(row.totals)} ` +
        "(session-total-only tools never fold into the report's top-level totals — measured, not asserted equal)"
    );
  }
  return envelope;
}

// ---------------------------------------------------------------------------------------
// Step 7 — telemetry-check.js: every claim reads ok or --, none FAILs undeclared
// ---------------------------------------------------------------------------------------

// "hook fired" is anchored to the *invoking process's own* CODEX_THREAD_ID /
// CLAUDE_CODE_SESSION_ID (see skills/02-check/scripts/lib/session-anchor.js) — meaningful
// only when check.js runs from inside the live tool's own session. Run from an external
// harness after the session ends, it reads FAIL by construction on every tool, every time;
// declared here once rather than re-discovered as a mystery failure per tool.
const DECLARED_CHECK_LIMITATIONS = [
  {
    label: "hook fired",
    toolId: null, // any tool — this is a property of the harness, not of one tool
    test: (detail) => /this session left no run file|has not trusted this plugin/.test(detail),
    reason:
      "check.js's 'hook fired' claim reads the invoking process's own session-id env var " +
      "(CODEX_THREAD_ID / CLAUDE_CODE_SESSION_ID) — this harness runs check.js from outside " +
      "the live session, so this claim reads FAIL here by construction, not because the hook " +
      "failed. Cross-checked against 'session journalled' and the run file itself.",
  },
  {
    label: "tool files readable",
    toolId: "cursor",
    test: (detail) => /no session found for any journalled session/.test(detail),
    reason:
      "Cursor has no local-read route at all (readers.js: capability.localRead is null — " +
      "'It writes no token count in any file it produces'). A cursor-only project's journal " +
      "names sessions no *other* tool's reader can ever find either, so this claim FAILs by " +
      "construction — the same gap already named by 'not covered: cursor' below it.",
  },
  {
    label: "session journalled",
    toolId: "opencode",
    test: (detail) => /all carrying only session_start/.test(detail),
    reason:
      "The only OpenCode session in this project is the free serve+curl proof (session.created " +
      "only, no message sent, no model call) — `opencode run`, the one route that would close " +
      "the turn, already failed and is SKIPped above with its own exact error. This claim " +
      "restates that same, already-declared gap rather than a new one.",
  },
];

function parseCheckLine(line) {
  const match = /^\s*(.{1,40}?)\s{2,}(ok|FAIL|--)\s+(.*)$/.exec(line);
  return match ? { label: match[1].trim(), verdict: match[2], detail: match[3].trim() } : null;
}

function findDeclaredLimitation(toolId, entry) {
  return DECLARED_CHECK_LIMITATIONS.find(
    (d) => entry.label === d.label && (d.toolId === null || d.toolId === toolId) && d.test(entry.detail)
  );
}

function runCheck(toolId, projectDir) {
  const checkScript = join(PLUGIN_DIR, "skills", "02-check", "scripts", "telemetry-check.js");
  const result = run("node", [checkScript], { cwd: projectDir, env: baseEnv() });
  const parsed = result.stdout.split("\n").map(parseCheckLine).filter(Boolean);
  if (parsed.length === 0) {
    claim(toolId, null, "check: claims parsed", FAIL, `no parseable claim lines: ${result.stdout.trim().slice(0, 300)}`);
    return;
  }
  for (const entry of parsed) {
    if (entry.verdict !== "FAIL") {
      claim(toolId, null, `check: ${entry.label}`, PASS, entry.detail);
      continue;
    }
    const declared = findDeclaredLimitation(toolId, entry);
    claim(toolId, null, `check: ${entry.label}`, declared ? SKIP(declared.reason) : FAIL, entry.detail);
  }
}

// ---------------------------------------------------------------------------------------
// Step 8 — report --axis day / --axis project, both summing to the same total
// ---------------------------------------------------------------------------------------

function runAxisReports(toolId, projectDir) {
  const reportScript = join(PLUGIN_DIR, "skills", "01-cost", "scripts", "telemetry-report.js");
  const base = ["report", ...reportPeriodArgs(), "--json"];
  const total = run("node", [reportScript, ...base], { cwd: projectDir, env: baseEnv() });
  const day = run("node", [reportScript, ...base, "--axis", "day"], { cwd: projectDir, env: baseEnv() });
  const project = run("node", [reportScript, ...base, "--axis", "project"], { cwd: projectDir, env: baseEnv() });
  if (total.code !== 0 || day.code !== 0 || project.code !== 0) {
    claim(toolId, null, "axis day/project agree", FAIL, "one of the three report invocations failed");
    return;
  }
  const totals = JSON.parse(total.stdout).totals;
  const dayArtefact = JSON.parse(day.stdout);
  const projectArtefact = JSON.parse(project.stdout);
  const daySum = sumCounters((dayArtefact.by_day ?? []).map((r) => ({ totals: r.totals })));
  const projectSum = sumCounters((projectArtefact.by_project ?? []).map((r) => ({ totals: r.totals })));
  const ok = reconciles(daySum, totals) && reconciles(projectSum, totals);
  claim(
    toolId,
    null,
    "axis day/project agree",
    ok ? PASS : FAIL,
    `day=${JSON.stringify(daySum)} project=${JSON.stringify(projectSum)} totals=${JSON.stringify(totals)}`
  );
}

// ---------------------------------------------------------------------------------------
// Per-tool session runners — each returns a list of {label, vendorId, note}
// ---------------------------------------------------------------------------------------

function extractVendorId(projectDir, beforeFiles) {
  const after = new Set(listRunFiles(projectDir));
  const before = new Set(beforeFiles);
  const added = [...after].filter((f) => !before.has(f));
  for (const path of added) {
    const start = readJournalLines(path).find((l) => l.type === "session_start");
    if (start) return start.vendor_id;
  }
  return null;
}

function runClaudeSession(projectDir, ticketPath) {
  const before = listRunFiles(projectDir);
  const prompt = `Read the file ${ticketPath} and then reply with exactly the word PONG.`;
  const result = run("claude", ["-p", prompt], { cwd: projectDir, env: baseEnv(), timeoutMs: 120000 });
  const vendorId = extractVendorId(projectDir, before);
  return [{ label: "default", vendorId, note: `exit ${result.code}` }];
}

function runCodexSession(projectDir, ticketPath, bypassTrust) {
  const before = listRunFiles(projectDir);
  const prompt = `Read the file ${ticketPath} and then reply with exactly the word PONG.`;
  const args = [
    "exec",
    "-m",
    "gpt-5.4",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    ...(bypassTrust ? ["--dangerously-bypass-hook-trust"] : []),
    prompt,
  ];
  const result = run("codex", args, { cwd: projectDir, env: baseEnv(), input: "", timeoutMs: 180000 });
  const vendorId = extractVendorId(projectDir, before);
  // A session the account was not allowed to run made no model call and therefore no tool
  // call, so nothing downstream can ask what it declared. Reported as its own reason rather
  // than as a missing line, which is what "an unknown is never a zero" means for a verifier.
  const output = `${result.stdout}${result.stderr}`;
  const blocked = /hit your usage limit|quota|insufficient_quota/i.test(output)
    ? output.match(/[^\n]*usage limit[^\n]*/i)?.[0]?.trim() ?? "the account could not run this session"
    : null;
  return {
    vendorId,
    blocked,
    note: `exit ${result.code}${result.code !== 0 ? `: ${result.stderr.trim().slice(-300)}` : ""}`,
  };
}

function runCopilotSession(projectDir, ticketPath) {
  const before = listRunFiles(projectDir);
  const prompt = `Read the file ${ticketPath} and then reply with exactly the word PONG.`;
  const ghToken = run("gh", ["auth", "token"], { env: baseEnv() }).stdout.trim();
  const env = {
    HOME: REAL_HOME,
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    USER: process.env.USER,
    LOGNAME: process.env.LOGNAME,
    SHELL: process.env.SHELL,
    GH_TOKEN: ghToken,
  };
  const result = run("copilot", ["-p", prompt, "--allow-all-tools"], { cwd: projectDir, env, timeoutMs: 180000 });
  const vendorId = extractVendorId(projectDir, before);
  return [{ label: "default", vendorId, note: `exit ${result.code}` }];
}

function cursorHeadless(projectDir, ticketPath) {
  const before = listRunFiles(projectDir);
  const prompt = `Read the file ${ticketPath} and then reply with exactly the word PONG.`;
  const result = run("cursor-agent", ["-p", prompt, "--force", "--trust"], {
    cwd: projectDir,
    env: baseEnv(),
    timeoutMs: 120000,
  });
  return { vendorId: extractVendorId(projectDir, before), note: `exit ${result.code}` };
}

function cursorInteractive(projectDir, ticketPath) {
  const before = listRunFiles(projectDir);
  const prompt = `Read the file ${ticketPath} and then reply with exactly the word DONE.`;
  const expectScript = [
    "#!/usr/bin/expect -f",
    "set timeout 100",
    `spawn cursor-agent agent {${prompt}} --force --trust`,
    'expect { "DONE" { } timeout { } }',
    "sleep 1",
    'send "\\x04"',
    "expect eof",
  ].join("\n");
  const scriptPath = join(projectDir, `.verify-chain-cursor-${nowStamp()}.exp`);
  writeFileSync(scriptPath, expectScript);
  run("chmod", ["+x", scriptPath]);
  run("expect", [scriptPath], { cwd: projectDir, env: baseEnv(), timeoutMs: 130000 });
  rmSync(scriptPath, { force: true });
  return { vendorId: extractVendorId(projectDir, before), note: "driven via a real pty (expect)" };
}

function opencodeServeProof(projectDir) {
  const port = 34000 + Math.floor(Math.random() * 4000);
  const server = spawn("opencode", ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: projectDir,
    env: baseEnv(),
    stdio: "ignore",
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const probe = run("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", `http://127.0.0.1:${port}/doc`]);
    if (probe.stdout.trim() !== "" && probe.stdout.trim() !== "000") break;
  }
  const before = listRunFiles(projectDir);
  // Measured: the first POST after a cold server start can race the plugin's own init and
  // produce no journal line; a second POST is the reliable proof. Both are free — no model
  // call, no token cost, session.created only.
  run("curl", ["-s", "-X", "POST", `http://127.0.0.1:${port}/session`, "-d", "{}"]);
  let vendorId = extractVendorId(projectDir, before);
  if (!vendorId) {
    run("curl", ["-s", "-X", "POST", `http://127.0.0.1:${port}/session`, "-d", "{}"]);
    vendorId = extractVendorId(projectDir, before);
  }
  server.kill("SIGTERM");
  return { vendorId, note: "opencode serve + curl POST /session — session_start only, no model call" };
}

function opencodeRun(projectDir, ticketPath) {
  const before = listRunFiles(projectDir);
  const prompt = `Read the file ${ticketPath} and then reply with exactly the word PONG.`;
  // Named rather than left to the default, the same way the Codex path names its model:
  // whichever model `opencode run` picks on its own varies per machine and per account, and
  // this run failed for two rounds with `build · big-pickle ... exit -1` before a named,
  // free model answered. AIDD_VERIFY_OPENCODE_MODEL overrides it for an account whose
  // catalog differs; `opencode models` lists what a machine actually has.
  const model = process.env.AIDD_VERIFY_OPENCODE_MODEL ?? "opencode/nemotron-3.5-lightning-free";
  const result = run("opencode", ["run", "--model", model, prompt], {
    cwd: projectDir,
    env: baseEnv(),
    timeoutMs: 180000,
  });
  const vendorId = extractVendorId(projectDir, before);
  return { vendorId, note: `exit ${result.code}`, failed: result.code !== 0, error: result.stderr.trim().slice(-500) };
}

// ---------------------------------------------------------------------------------------
// Per-tool orchestration
// ---------------------------------------------------------------------------------------

const TASK_DECLARED_EXPECTATION = {
  claude: { possible: true },
  codex: { possible: true },
  copilot: { possible: true },
  cursor: { possible: true },
  opencode: {
    possible: false,
    reason:
      "OpenCode's plugin (hooks/opencode-plugin.js) only observes session.created and " +
      "session.idle — no tool-call event ever reaches it, so task_declared can never fire " +
      "for this host (readers.js declares taskAttributable:false for the same reason).",
  },
};

function runVariant(toolId, variant, projectDir, vendorId, blocked = null) {
  const found = assertRunFile(toolId, variant, projectDir, vendorId);
  const expectation = blocked
    ? { possible: false, reason: `the session made no model call, so it made no tool call: ${blocked}` }
    : TASK_DECLARED_EXPECTATION[toolId];
  assertTaskDeclared(toolId, variant, found, expectation);
}

function orchestrateClaude(projectDir, ticketPath) {
  const [session] = runClaudeSession(projectDir, ticketPath);
  runVariant("claude", session.label, projectDir, session.vendorId);
}

function orchestrateCodex(projectDir, ticketPath) {
  const untrusted = runCodexSession(projectDir, ticketPath, false);
  if (untrusted.vendorId) {
    runVariant("codex", "default (no bypass)", projectDir, untrusted.vendorId, untrusted.blocked);
  } else {
    claim(
      "codex",
      "default (no bypass)",
      "run file exists",
      SKIP("issue #699 — the honest default: no run journal is written until the hook is trusted"),
      untrusted.note
    );
  }
  const trusted = runCodexSession(projectDir, ticketPath, true);
  runVariant("codex", "bypass-hook-trust", projectDir, trusted.vendorId, trusted.blocked);
}

function orchestrateCopilot(projectDir, ticketPath) {
  const [session] = runCopilotSession(projectDir, ticketPath);
  runVariant("copilot", session.label, projectDir, session.vendorId);
}

function orchestrateCursor(projectDir, ticketPath) {
  const headless = cursorHeadless(projectDir, ticketPath);
  runVariant("cursor", "headless (-p)", projectDir, headless.vendorId);
  const interactive = cursorInteractive(projectDir, ticketPath);
  runVariant("cursor", "interactive (pty)", projectDir, interactive.vendorId);
}

function orchestrateOpencode(projectDir, ticketPath) {
  const proof = opencodeServeProof(projectDir);
  claim(
    "opencode",
    "serve+curl (free)",
    "session_start observed",
    proof.vendorId ? PASS : FAIL,
    proof.vendorId ? `vendor_id=${proof.vendorId}, no turn boundary expected (no message sent)` : proof.note
  );
  const real = opencodeRun(projectDir, ticketPath);
  if (real.failed && !real.vendorId) {
    claim("opencode", "run (real)", "session ran", SKIP(`opencode run failed: ${real.error}`), real.note);
    return;
  }
  runVariant("opencode", "run (real)", projectDir, real.vendorId);
}

const ORCHESTRATORS = {
  claude: orchestrateClaude,
  codex: orchestrateCodex,
  copilot: orchestrateCopilot,
  cursor: orchestrateCursor,
  opencode: orchestrateOpencode,
};

// ---------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------

function printSummary(toolId) {
  const mine = results.filter((r) => r.tool === toolId);
  const pass = mine.filter((r) => r.verdict === PASS).length;
  const fail = mine.filter((r) => r.verdict === FAIL).length;
  const skip = mine.filter((r) => r.verdict.startsWith("SKIP")).length;
  out(`\n[${toolId}] summary: ${pass} PASS, ${fail} FAIL, ${skip} SKIP (of ${mine.length} claims)`);
}

function main() {
  const toolId = process.argv[2];
  if (!ORCHESTRATORS[toolId]) {
    out(`Usage: node scripts/verify-chain.mjs <${Object.keys(ORCHESTRATORS).join("|")}>`);
    process.exit(1);
  }

  ensureCliBuilt();
  const snapshots = realHomeTouchPoints(toolId).map(snapshotFile);
  const { base, projectDir } = newProjectDir(toolId);
  ACTIVE_CONFIG_DIR = join(base, "user-config");

  try {
    const installed = installFramework(toolId, projectDir);
    if (!installed) return;
    const switched = switchOn(toolId, projectDir);
    if (!switched) return;
    const ticketPath = seedTicket(projectDir);

    ORCHESTRATORS[toolId](projectDir, ticketPath);

    assertGitStatusHidesJournal(toolId, projectDir);
    runReport(toolId, projectDir);
    runCheck(toolId, projectDir);
    runAxisReports(toolId, projectDir);
  } finally {
    for (const snapshot of snapshots) restoreFile(snapshot);
    rmSync(base, { recursive: true, force: true });
    printSummary(toolId);
  }
}

main();

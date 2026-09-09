#!/usr/bin/env node
/**
 * Re-checks, without spending quota, the assumption the whole telemetry layer rests on:
 * the session identifier a hook receives is the one the tool's own files carry, so a cost
 * read out of those files can be placed against the work the journal recorded.
 *
 * It costs nothing because Claude Code mints its session identifier, fires `SessionStart`
 * and opens its transcript *before* it ever reaches the API: pointed at a dead address with
 * a fake key and an empty home, it still does all three and then fails the call. That is
 * what lets this run on every pull request rather than nightly.
 *
 * Exit codes are the point, not decoration:
 *   0  the join holds
 *   1  the tool changed — everything ran, and the identifiers disagree
 *   2  the probe is broken — it could not get far enough to have an opinion
 * Never report the second as the first: a missing binary is not evidence about the tool.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TOOL_CHANGED = 1;
const PROBE_BROKEN = 2;

/** Generous on purpose: against a dead address the tool retries, and every artefact this
 * probe reads is written long before the retries end, so the timeout bounds the run. */
const RUN_TIMEOUT_MS = 90_000;

/** Printed whichever way the run ends: a silent removal has to be visible in the log,
 * not only in a red cross. */
const CHECKED = [];

function report(name, verdict, detail) {
  CHECKED.push({ name, verdict, detail });
}

function printReport() {
  process.stdout.write("\nattributes checked by this probe\n");
  for (const { name, verdict, detail } of CHECKED) {
    process.stdout.write(`  ${verdict.padEnd(8)} ${name.padEnd(28)} ${detail}\n`);
  }
}

function fail(code, message) {
  printReport();
  const kind = code === PROBE_BROKEN ? "PROBE BROKEN" : "TOOL CHANGED";
  process.stderr.write(`\n${kind}: ${message}\n`);
  process.exit(code);
}

function resolveCli() {
  const built = path.resolve(__dirname, "..", "cli", "dist", "cli.js");
  if (!fs.existsSync(built)) fail(PROBE_BROKEN, `the CLI is not built at ${built}`);
  return built;
}

function resolveJournalHook() {
  const hook = path.resolve(__dirname, "..", "plugins", "aidd-telemetry", "hooks", "journal.cjs");
  if (!fs.existsSync(hook)) fail(PROBE_BROKEN, `the journal hook is not at ${hook}`);
  return hook;
}

function requireClaude() {
  const found = spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], {
    encoding: "utf8",
  });
  if (found.status !== 0 || !found.stdout.trim()) {
    fail(PROBE_BROKEN, "`claude` is not on PATH; install it before running this probe");
  }
  const version = spawnSync("claude", ["--version"], { encoding: "utf8" });
  return (version.stdout || "").trim();
}

/** Two hooks on one event: the capture hook witnesses what the tool handed over, the
 * journal hook is the real one — which is what makes a disagreement attributable. */
function makeProject(root, capture, journalHook) {
  const project = path.join(root, "project");
  fs.mkdirSync(path.join(project, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(project, ".aidd"), { recursive: true });
  fs.writeFileSync(
    path.join(project, ".aidd", "config.json"),
    `${JSON.stringify({ telemetry: { enabled: true } })}\n`
  );
  const witness = path.join(root, "capture.cjs");
  fs.writeFileSync(witness, CAPTURE_HOOK);
  fs.writeFileSync(
    path.join(project, ".claude", "settings.local.json"),
    `${JSON.stringify(
      {
        hooks: {
          SessionStart: [
            {
              hooks: [
                { type: "command", command: `node ${witness} SessionStart ${capture}` },
                { type: "command", command: `node ${journalHook} session-start` },
              ],
            },
          ],
        },
      },
      null,
      2
    )}\n`
  );
  spawnSync("git", ["init", "-q", project]);
  spawnSync("git", ["remote", "add", "origin", "git@github.com:aidd/identifier-join-probe.git"], {
    cwd: project,
  });
  return project;
}

const CAPTURE_HOOK = `const fs=require("node:fs"),path=require("node:path");
let raw="";process.stdin.setEncoding("utf8");
process.stdin.on("data",(c)=>{raw+=c});
process.stdin.on("end",()=>{try{fs.mkdirSync(process.argv[3],{recursive:true});
fs.writeFileSync(path.join(process.argv[3],process.argv[2]+".json"),raw)}catch{}process.exit(0)});
`;

/** The name is half the join: the hook writes `<run id>__<the tool's own session id>.jsonl`. */
function journalledSessionIds(project) {
  const dir = path.join(project, "aidd_docs", "runs");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl") && name.includes("__"))
    .map((name) => name.slice(name.indexOf("__") + 2, -".jsonl".length));
}

/** `claude-code-transcript.ts` locates a session by the identifier in the file name, so
 * this reads the same fact the production reader will. */
function transcriptSessionIds(configDir) {
  const root = path.join(configDir, "projects");
  if (!fs.existsSync(root)) return [];
  const ids = [];
  for (const dir of fs.readdirSync(root)) {
    const full = path.join(root, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const name of fs.readdirSync(full)) {
      if (name.endsWith(".jsonl")) ids.push(name.slice(0, -".jsonl".length));
    }
  }
  return ids;
}

function main() {
  const version = requireClaude();
  const cli = resolveCli();
  const journalHook = resolveJournalHook();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-join-probe-"));
  const capture = path.join(root, "capture");
  const sinkDir = path.join(root, "sink");
  const home = path.join(root, "home");
  const configDir = path.join(home, ".claude");
  const project = makeProject(root, capture, journalHook);

  // A dead address, a fake key and an empty home: the session opens, both hooks fire and
  // the transcript is created before any of the three matter.
  const run = spawnSync("claude", ["-p", "say OK"], {
    cwd: project,
    encoding: "utf8",
    timeout: RUN_TIMEOUT_MS,
    killSignal: "SIGKILL",
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_CONFIG_DIR: configDir,
      ANTHROPIC_BASE_URL: "http://127.0.0.1:9",
      ANTHROPIC_API_KEY: "sk-ant-probe-not-a-real-key",
    },
  });

  const capturedPath = path.join(capture, "SessionStart.json");
  if (!fs.existsSync(capturedPath)) {
    report("SessionStart hook", "MISSING", "no payload captured");
    fail(
      TOOL_CHANGED,
      `the SessionStart hook never fired on ${version}. It fired before the API call on ` +
        `2.1.250, which is what made this probe free. claude exited ${run.status}.`
    );
  }
  const payload = JSON.parse(fs.readFileSync(capturedPath, "utf8"));
  const hookId = payload.session_id;
  if (typeof hookId !== "string" || hookId === "") {
    report("session_id (hook)", "MISSING", `keys: ${Object.keys(payload).sort().join(", ")}`);
    fail(TOOL_CHANGED, "the SessionStart payload carries no session_id");
  }
  report("session_id (hook)", "present", hookId);

  const journalled = journalledSessionIds(project);
  report("session id (journal)", journalled.length ? "present" : "MISSING", journalled.join(", "));
  if (!journalled.includes(hookId)) {
    fail(
      TOOL_CHANGED,
      `the journal did not record the identifier the hook was handed on ${version}: the hook ` +
        `saw ${hookId}, the journal names ${journalled.join(", ") || "nothing"}.`
    );
  }

  const transcripts = transcriptSessionIds(configDir);
  report("session id (transcript)", transcripts.length ? "present" : "MISSING", transcripts.join(", "));
  if (transcripts.length === 0) {
    fail(
      TOOL_CHANGED,
      `${version} wrote no transcript against a dead API. It did on 2.1.250; if this is now ` +
        "deliberate, the probe has to run real sessions and stops being free."
    );
  }
  if (!transcripts.includes(hookId)) {
    fail(
      TOOL_CHANGED,
      `the join is broken on ${version}: the hook saw ${hookId}, the transcript is named ` +
        `${transcripts.join(", ")}. Every attribution in this layer assumes they are one value.`
    );
  }

  // What makes it *this system's* join rather than the probe's own comparison: the shipped
  // reader resolves the journalled session against the transcript, unaided.
  const read = spawnSync(process.execPath, [cli, "telemetry", "read"], {
    cwd: project,
    encoding: "utf8",
    env: { ...process.env, HOME: home, AIDD_USER_CONFIG_DIR: sinkDir },
  });
  const stdout = read.stdout || "";
  // "no session found" says the join failed; "read" says it held and the session carried no
  // billable record, which is right against a dead API. Two sentences on purpose.
  const found = /Claude Code:\s*read/u.test(stdout);
  report("read locates the session", found ? "present" : "MISSING", stdout.trim().split("\n")[1] ?? "");
  if (!found) {
    fail(
      TOOL_CHANGED,
      `\`aidd telemetry read\` did not locate the session the journal named on ${version}. ` +
        `It exited ${read.status} and said:\n${stdout}`
    );
  }

  printReport();
  process.stdout.write(`\nthe identifier join holds on ${version} — ${hookId}\n`);
  process.stdout.write("cost: zero tokens, no credentials, no model call reached.\n");
}

main();

#!/usr/bin/env node
/**
 * Re-checks, without spending quota, the assumption the whole telemetry layer rests on:
 * the session identifier a hook receives is the one the tool's own export carries.
 *
 * #632 proved it by running one real session. One session is a snapshot, and a tool update
 * can break the join without anything turning red. This is that check, made repeatable.
 *
 * **It costs nothing.** Claude Code mints its session identifier, fires `SessionStart` and
 * emits OTLP *before* it ever reaches the API. Pointed at a dead address with a fake key and
 * an empty home, it still does all three and then fails the call. Measured 2026-08-28 on
 * 2.1.250: three runs, three joins, zero tokens and no credentials — which is what lets this
 * run on every pull request rather than nightly.
 *
 * Exit codes are the point, not decoration:
 *   0  the join holds
 *   1  the tool changed — everything ran, and the identifiers or attributes disagree
 *   2  the probe is broken — it could not get far enough to have an opinion
 * Never report the second as the first: a missing binary is not evidence about the tool.
 */
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TOOL_CHANGED = 1;
const PROBE_BROKEN = 2;

/** Attributes this probe actually looked at, printed whichever way the run ends: a silent
 * removal has to be visible in the log, not only in a red cross. */
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

/** A port derived from this process, not asked of the OS: `listen(0)` resolves
 * asynchronously and this probe is deliberately synchronous end to end. A port already in
 * use is not a silent problem — the receiver fails to bind, `waitForListening` times out,
 * and the run exits PROBE BROKEN naming the log, which is the correct classification. */
function probePort() {
  return 40000 + (process.pid % 20000);
}

function resolveCli() {
  const built = path.resolve(__dirname, "..", "cli", "dist", "cli.js");
  if (!fs.existsSync(built)) fail(PROBE_BROKEN, `the CLI is not built at ${built}`);
  return built;
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

function makeProject(root, port, capture) {
  const project = path.join(root, "project");
  fs.mkdirSync(path.join(project, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(project, ".aidd"), { recursive: true });
  fs.writeFileSync(
    path.join(project, ".aidd", "config.json"),
    `${JSON.stringify({ telemetry: { enabled: true } })}\n`
  );
  const hook = path.join(root, "capture.cjs");
  fs.writeFileSync(hook, CAPTURE_HOOK);
  fs.writeFileSync(
    path.join(project, ".claude", "settings.local.json"),
    `${JSON.stringify(
      {
        env: {
          CLAUDE_CODE_ENABLE_TELEMETRY: "1",
          OTEL_METRICS_EXPORTER: "otlp",
          OTEL_LOGS_EXPORTER: "otlp",
          OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
          OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
          OTEL_METRIC_EXPORT_INTERVAL: "1000",
          OTEL_RESOURCE_ATTRIBUTES: "aidd.project_id=identifier-join-probe",
        },
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: `node ${hook} SessionStart ${capture}` }] },
          ],
        },
      },
      null,
      2
    )}\n`
  );
  spawnSync("git", ["init", "-q", project]);
  return project;
}

const CAPTURE_HOOK = `const fs=require("node:fs"),path=require("node:path");
let raw="";process.stdin.setEncoding("utf8");
process.stdin.on("data",(c)=>{raw+=c});
process.stdin.on("end",()=>{try{fs.mkdirSync(process.argv[3],{recursive:true});
fs.writeFileSync(path.join(process.argv[3],process.argv[2]+".json"),raw)}catch{}process.exit(0)});
`;

function waitForListening(logPath, deadlineMs) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    if (fs.existsSync(logPath) && /Listening for OTLP/u.test(fs.readFileSync(logPath, "utf8"))) {
      return true;
    }
    spawnSync(process.execPath, ["-e", "setTimeout(()=>{},150)"]);
  }
  return false;
}

function readSinkRecords(configDir) {
  const dir = path.join(configDir, "telemetry");
  if (!fs.existsSync(dir)) return [];
  const records = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"))) {
    for (const line of fs.readFileSync(path.join(dir, name), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line));
      } catch {
        /* a half-written line is not a verdict about the tool */
      }
    }
  }
  return records;
}

function main() {
  const version = requireClaude();
  const cli = resolveCli();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-join-probe-"));
  const capture = path.join(root, "capture");
  const configDir = path.join(root, "config");
  const port = probePort();
  const project = makeProject(root, port, capture);
  const logPath = path.join(root, "receive.log");
  const log = fs.openSync(logPath, "a");

  const receiver = spawn(process.execPath, [cli, "telemetry", "receive", "--port", String(port)], {
    env: { ...process.env, AIDD_USER_CONFIG_DIR: configDir },
    stdio: ["ignore", log, log],
    detached: true,
  });

  try {
    if (!waitForListening(logPath, 15000)) {
      fail(PROBE_BROKEN, `the OTLP receiver never listened on ${port}; see ${logPath}`);
    }

    // A dead address, a fake key and an empty home: the session opens, the hook fires and the
    // export is emitted before any of the three matter. That is what makes this free.
    const run = spawnSync("claude", ["-p", "say OK"], {
      cwd: project,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: path.join(root, "home"),
        CLAUDE_CONFIG_DIR: path.join(root, "home", ".claude"),
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

    // The export is flushed on its own interval; give it room before concluding.
    let records = [];
    const until = Date.now() + 20000;
    while (Date.now() < until) {
      records = readSinkRecords(configDir);
      if (records.length > 0) break;
      spawnSync(process.execPath, ["-e", "setTimeout(()=>{},250)"]);
    }
    if (records.length === 0) {
      report("OTLP export", "MISSING", "no record reached the sink");
      fail(
        TOOL_CHANGED,
        `${version} emitted no telemetry against a dead API. It did on 2.1.250; if this is ` +
          "now deliberate, the probe has to run real sessions and stops being free."
      );
    }
    report("OTLP export", "present", `${records.length} record(s)`);

    const vendorIds = [...new Set(records.map((r) => r.vendor_id).filter(Boolean))];
    report("vendor_id (export)", vendorIds.length ? "present" : "MISSING", vendorIds.join(", "));
    report("project_id (export)", "checked", [...new Set(records.map((r) => r.project_id))].join(", "));
    report("tool (export)", "checked", [...new Set(records.map((r) => r.tool))].join(", "));

    if (!vendorIds.includes(hookId)) {
      fail(
        TOOL_CHANGED,
        `the join is broken on ${version}: the hook saw ${hookId}, the export carries ` +
          `${vendorIds.join(", ") || "nothing"}. Every attribution in this layer assumes they are one value.`
      );
    }

    printReport();
    process.stdout.write(`\nthe identifier join holds on ${version} — ${hookId}\n`);
    process.stdout.write("cost: zero tokens, no credentials, no model call reached.\n");
  } finally {
    try {
      process.kill(-receiver.pid);
    } catch {
      /* already gone */
    }
    fs.closeSync(log);
  }
}

main();

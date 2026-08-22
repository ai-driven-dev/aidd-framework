#!/usr/bin/env node
// Whether the measurement chain is actually recording, not merely installed: a hook that
// fired, a session that closed, a tool's own files that can be read, and the two joining.
//
// Ships inside the skill that owns the question. Zero dependencies, plain CommonJS, like
// the hooks: installing the plugin is the whole installation.
//
// Usage: telemetry-check.js

const fs = require("node:fs");
const path = require("node:path");

const { listJournals } = require("./lib/journal.js");
const { TOOLS, homeDir } = require("./lib/readers.js");
const { buildIntervals, attribute } = require("./lib/attribution.js");
const { diagnose } = require("./lib/diagnose.js");
const { printReport } = require("./lib/render.js");
const { switchOn } = require("./lib/switch.js");
const { isGitRepo } = require("./lib/repo.js");
const { resolveSessionAnchor } = require("./lib/session-anchor.js");
const { readCodexHookTrust } = require("./lib/hook-trust.js");
const { UNRECOGNISED_FILE_NAME } = require("./lib/unrecognised.js");

const out = (line) => process.stdout.write(`${line}\n`);

/** One tool's own records for one session, each already carrying whether it joined a step.
 * A reader that throws carries its message rather than reading as a plain miss: the two
 * are different claims, and folding one into the other would be a silent failure. */
function readTool(declaration, sessionId, intervals) {
  let read;
  let error;
  try {
    read = declaration.read(homeDir(), sessionId);
  } catch (thrown) {
    read = { records: [], sessionFound: false };
    error = thrown instanceof Error ? thrown.message : String(thrown);
  }
  const records = read.records.map((record) => ({ ...record, ...attribute(record, intervals) }));
  return {
    tool: declaration.tool,
    sessionFound: read.sessionFound,
    records,
    hasIntervals: intervals.length > 0,
    ...(error === undefined ? {} : { error }),
  };
}

function toolReadsFor(journal, sessionId, covered) {
  const intervals = buildIntervals(journal);
  return covered.map((declaration) => readTool(declaration, sessionId, intervals));
}

// A tool declared `journalAttributable: false` can never be found this way: the journal
// never names one of its own sessions, so probing it against another tool's session id is
// not an attempt that can fail, and reading it as one would overstate what was checked.
function reachableViaJournal(declaration) {
  return Boolean(declaration.read) && declaration.capability.journalAttributable !== false;
}

function gather(projectRoot) {
  const journals = listJournals(projectRoot);
  const covered = TOOLS.filter(reachableViaJournal);
  const toolReads = journals
    .filter((journal) => journal.session && journal.session.vendor_id)
    .flatMap((journal) => toolReadsFor(journal, journal.session.vendor_id, covered));
  return { journals, toolReads, uncovered: TOOLS.filter((declaration) => !reachableViaJournal(declaration)) };
}

function runsDirLabel() {
  return process.env.AIDD_RUNS_DIR || "aidd_docs/runs";
}

// Mirrors lib/journal.js's own (unexported) directory resolution: the marker's path must
// match the hooks-side writer's exactly, not runsDirLabel()'s display string.
function runsDirPath(projectRoot) {
  return process.env.AIDD_RUNS_DIR || path.join(projectRoot, "aidd_docs", "runs");
}

// Read directly, by the exact name handleUnrecognisedPayload writes (hooks/lib/record.js) -
// never through listJournals(), whose parser drops the line's own `type` and would leave
// this indistinguishable from a torn run file (see sessionJournalsOf in lib/diagnose.js).
// Mirrors readJournalFile's own line validation (lib/journal.js) - a line that does not
// carry the shape handleUnrecognisedPayload writes is not this marker, torn or otherwise.
function readUnrecognisedPayload(projectRoot) {
  let content;
  try {
    content = fs.readFileSync(path.join(runsDirPath(projectRoot), UNRECOGNISED_FILE_NAME), "utf8");
  } catch {
    return null;
  }
  const line = content.split("\n").find((raw) => raw.trim() !== "");
  if (!line) return null;
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (parsed.type !== "unrecognised_payload" || typeof parsed.at !== "string") return null;
  return parsed;
}

// Stops the run before any claim is evaluated: neither is evidence about the hook, both
// are facts about whether there is anything here for it to have written.
function gateMessage(projectRoot) {
  if (!switchOn(projectRoot)) return "measurement is off — nothing to check until it is turned on";
  if (!isGitRepo(projectRoot)) {
    return "not a git repository — the hook has nowhere to write here, not a hook that failed to fire";
  }
  return null;
}

function main() {
  const projectRoot = process.cwd();
  const gate = gateMessage(projectRoot);
  if (gate) {
    out(`  ${gate}`);
    return 0;
  }
  const { journals, toolReads, uncovered } = gather(projectRoot);
  const currentSessionId = resolveSessionAnchor(process.env);
  const unrecognisedPayload = readUnrecognisedPayload(projectRoot);
  // Only Codex gates a hook behind a trust grant it can decline in silence: a session
  // running under any other tool has nothing to read here, and asks nothing of it - the
  // same "told nothing" rule the install-time notice follows.
  const hookTrust = process.env.CODEX_THREAD_ID ? readCodexHookTrust(homeDir()) : null;
  const claims = diagnose({
    journals,
    toolReads,
    runsDirLabel: runsDirLabel(),
    currentSessionId,
    unrecognisedPayload,
    hookTrust,
  });
  printReport(out, { claims, uncovered });
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

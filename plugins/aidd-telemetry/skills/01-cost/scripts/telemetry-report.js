#!/usr/bin/env node
// What sessions consumed, read from the files their tools already wrote.
//
// Ships inside the skill that owns the question. Zero dependencies, plain CommonJS like
// the hooks: installing the plugin is the whole installation.
//
// Usage:
//   telemetry-report read [--session <id>]
//   telemetry-report report [--from <day>] [--to <day>] [--days <n>] [--task <id>] [--json]

const { buildIntervals, attribute } = require("./lib/attribution.js");
const { listJournals, readJournal, projectOf } = require("./lib/journal.js");
const { TOOLS, DISPLAY_NAME, homeDir } = require("./lib/readers.js");
const { printReport, toEnvelope, buildArtefact, ARTEFACT_AXES } = require("./lib/render.js");
const { build } = require("./lib/report.js");
const { SCHEMA_VERSION, append, readForVendor, readPeriod } = require("./lib/sink.js");

const DEFAULT_DAYS = 7;
const MAX_DAYS = 3650;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const USAGE = [
  "Usage:",
  "  telemetry-report read [--session <id>]",
  "  telemetry-report report [--from <day>] [--to <day>] [--days <n>] [--task <id>] [--json]",
  `  telemetry-report report ... --axis <${ARTEFACT_AXES.join("|")}>`,
].join("\n");

const out = (line) => process.stdout.write(`${line}\n`);

function flag(argv, name) {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function parseDay(name, value) {
  const parsed = DAY_PATTERN.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(Number.NaN);
  if (Number.isNaN(parsed.getTime()) || dayKey(parsed) !== value) {
    throw new Error(`Invalid ${name} '${value}'. Expected a UTC day, as YYYY-MM-DD.`);
  }
  return value;
}

/**
 * What was asked for, resolved once into two absolute days. A figure a consumer cannot
 * reproduce is one it cannot cite, so the report always states the pair it resolved rather
 * than the words it was given.
 */
function resolvePeriod(argv, today) {
  const rawDays = flag(argv, "--days");
  let span = DEFAULT_DAYS;
  if (rawDays !== undefined) {
    span = Number(rawDays);
    if (!Number.isInteger(span) || span < 1 || span > MAX_DAYS) {
      throw new Error(`Invalid --days '${rawDays}'. Expected an integer between 1 and ${MAX_DAYS}.`);
    }
  }
  const rawTo = flag(argv, "--to");
  const rawFrom = flag(argv, "--from");
  const toDay = rawTo === undefined ? dayKey(today) : parseDay("--to", rawTo);
  const fromDay =
    rawFrom === undefined
      ? dayKey(new Date(Date.parse(`${toDay}T00:00:00Z`) - (span - 1) * MS_PER_DAY))
      : parseDay("--from", rawFrom);
  return fromDay <= toDay ? { fromDay, toDay } : { fromDay: toDay, toDay: fromDay };
}

/**
 * Five answers, and only `empty` may ever be printed as a zero. `not-found` is a tool with
 * no trace of the session, `unreadable` one whose reader failed, `not-covered` one nothing
 * here can read at all.
 */
function readOneTool(declaration, sessionId, intervals, project, at) {
  const base = { tool: declaration.tool, recordsFound: 0, recordsStored: 0, sessionsFailed: 0 };
  if (!declaration.read) {
    return { ...base, status: "not-covered", ...(declaration.reason ? { reason: declaration.reason } : {}) };
  }
  let read;
  try {
    read = declaration.read(homeDir(), sessionId);
  } catch (error) {
    // A fan-out over independent sources: one reader failing is one of several, not one
    // operation that failed. Throwing here would cost every other tool's figures.
    const failure = error instanceof Error ? error.message : String(error);
    return { ...base, status: "unreadable", sessionsFailed: 1, reason: failure, failureReason: failure };
  }
  const stored = store(declaration.tool, sessionId, read.records, intervals, project, at);
  return {
    ...base,
    status: read.records.length > 0 ? "found" : read.sessionFound ? "empty" : "not-found",
    recordsFound: read.records.length,
    recordsStored: stored,
    ...(declaration.limitation ? { reason: declaration.limitation } : {}),
  };
}

/** Matched on `turn_id` alone, never on a hash of the line: the tool's own file keeps
 * growing as the same record is read again. A record with no turn id cannot be matched and
 * is appended, since inventing a key for it would be worse than appending twice.
 *
 * `project` is resolved once per session, from the same journal `intervals` was built
 * from, and spread onto every record it covers - never re-derived per record, and never
 * from wherever this process happens to be running. */
function store(tool, sessionId, records, intervals, project, at) {
  if (records.length === 0) return 0;
  const known = new Set(
    readForVendor(sessionId)
      .map((record) => record.turn_id)
      .filter((id) => id !== undefined)
  );
  let stored = 0;
  for (const record of records) {
    if (record.turn_id !== undefined && known.has(record.turn_id)) continue;
    append(
      {
        ...record,
        sink_schema_version: SCHEMA_VERSION,
        provenance: "local-read",
        tool,
        ...attribute(record, intervals),
        ...project,
      },
      at
    );
    stored += 1;
  }
  return stored;
}

/** The strongest answer a tool gave anywhere in a sweep. A tool that read one session and
 * failed another reports as read - its figures are real - while `sessionsFailed` keeps the
 * failure visible, because a status honest about the figures must not be a silence about
 * the failures. */
const STATUS_RANK = ["found", "unreadable", "empty", "not-found", "not-covered"];

function mergeReports(sessions) {
  return TOOLS.map(({ tool }) => {
    const reports = sessions.flatMap((session) =>
      session.toolReports.filter((report) => report.tool === tool)
    );
    const strongest = reports.reduce(
      (best, report) =>
        STATUS_RANK.indexOf(report.status) < STATUS_RANK.indexOf(best.status) ? report : best,
      reports[0] ?? { tool, status: "not-found", recordsFound: 0, recordsStored: 0, sessionsFailed: 0 }
    );
    const failures = reports.map((r) => r.failureReason).filter((reason) => reason !== undefined);
    return {
      ...strongest,
      recordsFound: reports.reduce((sum, r) => sum + r.recordsFound, 0),
      recordsStored: reports.reduce((sum, r) => sum + r.recordsStored, 0),
      sessionsFailed: failures.length,
      ...(failures.length === 0 ? {} : { failureReason: failures[failures.length - 1] }),
    };
  });
}

const STATUS_LABELS = {
  found: "read",
  empty: "read, nothing found",
  "not-found": "no session found",
  unreadable: "could not be read",
  "not-covered": "not covered",
};

function runRead(argv, projectRoot) {
  const named = flag(argv, "--session");
  // With no session named, every session the journal knows: nothing tells a person their
  // session identifier, and the journal has recorded every one of them.
  const sessionIds = named
    ? [named]
    : [
        ...new Set(
          listJournals(projectRoot)
            .map((journal) => journal.session && journal.session.vendor_id)
            .filter((id) => id !== null && id !== undefined)
        ),
      ];
  const at = new Date();
  const sessions = sessionIds.map((sessionId) => {
    const journal = readJournal(projectRoot, sessionId);
    const intervals = journal ? buildIntervals(journal) : [];
    const project = projectOf(journal);
    return {
      sessionId,
      toolReports: TOOLS.map((tool) => readOneTool(tool, sessionId, intervals, project, at)),
    };
  });

  if (sessions.length === 0) {
    out("  No session journalled yet — nothing to read.");
    return;
  }
  const yielded = sessions.filter((s) => s.toolReports.some((r) => r.recordsFound > 0)).length;
  out(`  ${sessions.length} session${sessions.length === 1 ? "" : "s"} read, ${yielded} with records`);
  for (const report of mergeReports(sessions)) {
    const counts = report.status === "found" ? ` (${report.recordsStored} new of ${report.recordsFound})` : "";
    const because = report.reason ? ` — ${report.reason}` : "";
    const failures =
      report.sessionsFailed > 0
        ? ` [${report.sessionsFailed} session${report.sessionsFailed === 1 ? "" : "s"} could not be read: ${report.failureReason}]`
        : "";
    out(`  ${DISPLAY_NAME[report.tool]}: ${STATUS_LABELS[report.status]}${counts}${because}${failures}`);
  }
}

function runReport(argv, projectRoot) {
  // The clock is read once, here: everything downstream works from two absolute days, so
  // the same call answers the same twice.
  const { fromDay, toDay } = resolvePeriod(argv, new Date());
  const read = readPeriod(fromDay, toDay);
  const task = flag(argv, "--task");
  const report = build({
    fromDay,
    toDay,
    records: read.records,
    journals: listJournals(projectRoot),
    declaredTools: TOOLS.map((tool) => ({
      tool: tool.tool,
      coverage: tool.read ? "covered" : "not-covered",
      ...(tool.reason ? { reason: tool.reason } : {}),
      ...(tool.limitation ? { reason: tool.limitation } : {}),
      capability: tool.capability,
    })),
    undatedRecords: read.undated.length,
    unreadableLines: read.skipped,
    ...(task === undefined ? {} : { task }),
  });
  emitReport(out, argv, report);
}

/** JSON, one axis's artefact, or the full text - in that order of preference, since a
 * caller asking for the object wants it whole even when `--axis` was also given. */
function emitReport(out, argv, report) {
  if (argv.includes("--json")) return out(JSON.stringify(toEnvelope(report), null, 2));
  const axis = flag(argv, "--axis");
  if (axis !== undefined) return out(buildArtefact(toEnvelope(report), axis));
  return printReport(out, report);
}

function main(argv) {
  const projectRoot = process.cwd();
  if (argv[2] === "read") return runRead(argv, projectRoot), 0;
  if (argv[2] === "report") return runReport(argv, projectRoot), 0;
  process.stderr.write(`${USAGE}\n`);
  return 1;
}

try {
  process.exit(main(process.argv));
} catch (error) {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

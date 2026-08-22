// One period's records, reduced to a report whose every breakdown sums to its total.

const { SOURCES } = require("./attribution.js");

const MICRO_USD_PER_USD = 1e6;
const COUNTERS = {
  inputTokens: "input_tokens",
  outputTokens: "output_tokens",
  cacheReadTokens: "cache_read_tokens",
  cacheCreationTokens: "cache_creation_tokens",
};

const TASK_FOLDER = /^aidd_docs\/tasks\/(\d{4}_\d{2})\/([^/]+)\//u;
const TASK_FILE = /^aidd_docs\/tasks\/(\d{4}_\d{2})\/([^/]+)\.md$/u;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAY_KEY_LENGTH = "YYYY-MM-DD".length;

// A record with no project is its own group, never folded into one that was actually
// placed. A symbol can never equal a real `project_id` string, so it is a safe Map key
// for "unknown" beside every value a record might actually carry.
const NO_KNOWN_PROJECT = Symbol("no known project");

/** The task a written path belongs to. Derived here rather than stored, so changing the
 * derivation re-reads every past session instead of leaving a stale conclusion behind. */
function taskOf(writtenPath) {
  if (writtenPath.includes("..")) return null;
  const match = TASK_FOLDER.exec(writtenPath) ?? TASK_FILE.exec(writtenPath);
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * Money is carried as whole micro-dollars, never as the floating amount a record stores.
 * The report's claim is that its parts add up exactly, and floating addition does not have
 * that property across two groupings. Rounding once, on the way in, makes every later sum
 * exact for half a micro-dollar per record.
 */
function toMicroUsd(costUsd) {
  return Math.round(costUsd * MICRO_USD_PER_USD);
}

/** Keeps "never observed" apart from "observed as zero": a tool whose files carry no
 * amount has an unknown cost, not a free one. */
function newTotals() {
  return { requests: 0 };
}

function addTo(totals, record) {
  totals.requests += 1;
  if (typeof record.cost_usd === "number") {
    totals.costMicroUsd = (totals.costMicroUsd ?? 0) + toMicroUsd(record.cost_usd);
  }
  for (const [field, source] of Object.entries(COUNTERS)) {
    if (typeof record[source] === "number") {
      totals[field] = (totals[field] ?? 0) + record[source];
    }
  }
}

function group(groups, key, record) {
  if (!groups.has(key)) groups.set(key, newTotals());
  addTo(groups.get(key), record);
}

function tokensOf(totals) {
  return (
    (totals.inputTokens ?? 0) +
    (totals.outputTokens ?? 0) +
    (totals.cacheReadTokens ?? 0) +
    (totals.cacheCreationTokens ?? 0)
  );
}

/** Largest first, with a stable tie-break on the row's own key, so the same records always
 * produce the same report whatever order they arrived in. Weighted by tokens where no
 * amount exists, or a tool that carries none would sort as if it had cost nothing. */
function bySize(rows, keyOf) {
  return [...rows].sort((left, right) => {
    const weight = (row) => row.totals.costMicroUsd ?? tokensOf(row.totals);
    return weight(right) - weight(left) || keyOf(left).localeCompare(keyOf(right));
  });
}

/** The UTC day a record's own moment falls on, mirroring sink.js's own `recordDayKey`.
 * Duplicated rather than imported: this file groups over records already selected by that
 * function, and the two must agree on every input without a runtime dependency between
 * them - the same reasoning that keeps `journal.js`'s copy of `sanitizePathSegment`
 * separate from `repo.js`'s. */
function recordDayKey(record) {
  const at = record.event_timestamp;
  if (typeof at !== "string") return null;
  if (at.length >= DAY_KEY_LENGTH && at.endsWith("Z")) return at.slice(0, DAY_KEY_LENGTH);
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, DAY_KEY_LENGTH);
}

/** Every UTC day from `fromDay` to `toDay`, inclusive - the full period, whether or not a
 * record ever lands on a given day. A day with nothing is still a row: a gap in a series
 * reads as continuity, so the row has to exist to be a zero. */
function dayRange(fromDay, toDay) {
  const days = [];
  const end = Date.parse(`${toDay}T00:00:00Z`);
  for (let at = Date.parse(`${fromDay}T00:00:00Z`); at <= end; at += MS_PER_DAY) {
    days.push(new Date(at).toISOString().slice(0, DAY_KEY_LENGTH));
  }
  return days;
}

function projectKeyOf(record) {
  return typeof record.project_id === "string" && record.project_id !== ""
    ? record.project_id
    : NO_KNOWN_PROJECT;
}

function vendorIdsForTask(journals, task) {
  const wanted = new Set();
  for (const journal of journals) {
    if (!journal.session) continue;
    const tasks = journal.filesWritten.map((written) => taskOf(written.path));
    if (tasks.includes(task)) wanted.add(journal.session.vendor_id);
  }
  return wanted;
}

/**
 * Money and the four token counters come from `kind: "request"` records alone, and active
 * time from `kind: "session"` records alone. The two kinds measure overlapping quantities
 * in incompatible ways, and summing across them counts the same tokens twice while
 * producing a total that looks right.
 */
function build(input) {
  const wanted = input.task === undefined ? null : vendorIdsForTask(input.journals, input.task);
  const records = input.records.filter((r) => wanted === null || wanted.has(r.vendor_id));

  const totals = newTotals();
  const steps = new Map();
  const models = new Map();
  const tools = new Map();
  const attributions = new Map();
  const projects = new Map();
  const days = new Map();
  for (const day of dayRange(input.fromDay, input.toDay)) days.set(day, newTotals());
  let activeTimeSeconds;

  for (const record of records) {
    if (record.kind === "session") {
      if (typeof record.active_time_s === "number") {
        activeTimeSeconds = (activeTimeSeconds ?? 0) + record.active_time_s;
      }
      continue;
    }
    addTo(totals, record);
    group(steps, `${record.step_attribution} ${record.step ?? ""}`, record);
    group(attributions, record.step_attribution, record);
    group(tools, record.tool, record);
    if (record.model !== undefined) group(models, record.model, record);
    group(projects, projectKeyOf(record), record);
    const day = recordDayKey(record);
    if (day !== null && days.has(day)) addTo(days.get(day), record);
  }

  return {
    fromDay: input.fromDay,
    toDay: input.toDay,
    ...(input.task === undefined ? {} : { task: input.task }),
    sessions: new Set(records.map((record) => record.vendor_id)).size,
    totals,
    ...(activeTimeSeconds === undefined ? {} : { activeTimeSeconds }),
    bySteps: stepRows(steps),
    byModels: bySize(
      [...models].map(([model, t]) => ({ model, totals: t })),
      (row) => row.model
    ),
    byTools: toolRows(input.declaredTools, tools),
    byProjects: projectRows(projects),
    byDays: dayRows(days),
    attributionMix: attributionRows(attributions),
    undatedRecords: input.undatedRecords,
    unreadableLines: input.unreadableLines,
  };
}

/** Keyed by the step *and* the strength of its attribution: one skill reached from the
 * tool's own statement and from an interval is two claims, and merging them would present
 * an inference as a measurement. */
function stepRows(steps) {
  const rows = [...steps].map(([key, totals]) => {
    const separator = key.indexOf(" ");
    const step = key.slice(separator + 1);
    return { attribution: key.slice(0, separator), ...(step === "" ? {} : { step }), totals };
  });
  return bySize(rows, (row) => `${row.step ?? ""}/${row.attribution}`);
}

/** All three, always. A strength that accounted for nothing is the one place a zero is the
 * measurement: the total is known, and none of it came from that source. */
function attributionRows(attributions) {
  return SOURCES.map((attribution) => ({
    attribution,
    totals: attributions.get(attribution) ?? newTotals(),
  }));
}

/** Every project a record named, largest first, plus one row for what named none - never
 * folded into a neighbour, since that would place a figure that was never placed.
 * `project` is absent on that row, the same convention `bySteps` uses for `unattributed`. */
function projectRows(projects) {
  const rows = [...projects].map(([key, totals]) => ({
    ...(key === NO_KNOWN_PROJECT ? {} : { project: key }),
    totals,
  }));
  return bySize(rows, (row) => row.project ?? "");
}

/** Every day in the period, in order - never sorted by size, unlike every other breakdown
 * here. A series read out of order is not a series; a day that ran nothing is a row of
 * zeros, since a gap would read as continuity rather than as the fact it is. */
function dayRows(days) {
  return [...days].map(([day, totals]) => ({ day, totals }));
}

/** Every declared tool, in declared order, contributing or not. A tool missing from the
 * list is one a reader takes for idle, and for an unreadable one that is a false zero. */
function toolRows(declaredTools, measured) {
  return declaredTools.map((declaration) => ({
    tool: declaration.tool,
    coverage: declaration.coverage,
    ...(declaration.reason === undefined ? {} : { reason: declaration.reason }),
    capability: declaration.capability,
    totals: measured.get(declaration.tool) ?? newTotals(),
  }));
}

module.exports = { build, taskOf, tokensOf, toMicroUsd };

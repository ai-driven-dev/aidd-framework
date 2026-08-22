// One period's records, reduced to a report whose every breakdown sums to its total.

const { SOURCES } = require("../../../_shared/attribution.js");

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
 * A declared interval runs from its own `task_declared` line to whichever of a later
 * declaration or a `turn_end` comes next - never to the run file's own end. No tool exposes
 * when a flow leaves a ticket, so treating an unclosed declaration as boundless would
 * attribute everything the session goes on to do, for as long as it keeps running, to the
 * first ticket it ever named - exactly the failure this same file accepts for a step
 * interval and a task interval must not repeat. An unclosed declaration is capped at the
 * last moment the journal actually recorded instead: a session that crashes mid-task stops
 * producing lines entirely, so there is nothing after that moment to misattribute, and a
 * session that keeps going is bounded by whichever boundary - of any kind - comes next.
 */
function buildTaskIntervals(journal) {
  const timed = (journal.boundaries ?? [])
    .concat(journal.taskDeclarations ?? [])
    .map((boundary) => ({ boundary, atMs: Date.parse(boundary.at) }))
    .filter(({ atMs }) => !Number.isNaN(atMs))
    .sort((left, right) => left.atMs - right.atMs);
  const lastMs = timed.length > 0 ? timed[timed.length - 1].atMs : undefined;

  const relevant = timed.filter(
    ({ boundary }) => boundary.type === "task_declared" || boundary.type === "turn_end"
  );
  const intervals = [];
  for (const [index, { boundary, atMs }] of relevant.entries()) {
    if (boundary.type !== "task_declared") continue;
    const next = relevant[index + 1];
    intervals.push({ path: boundary.path, startMs: atMs, endMs: next ? next.atMs : (lastMs ?? atMs) });
  }
  return intervals;
}

/** Every session whose own declared intervals include one naming `task`, keyed by vendor id
 * so a record's session is a lookup rather than a walk of every journal again. A session
 * that never declared this task carries no entry, which is what makes an undeclared session
 * read as belonging to none. */
function declaredIntervalsForTask(journals, task) {
  const byVendorId = new Map();
  for (const journal of journals) {
    if (!journal.session) continue;
    const intervals = buildTaskIntervals(journal).filter((interval) => taskOf(interval.path) === task);
    if (intervals.length > 0) byVendorId.set(journal.session.vendor_id, intervals);
  }
  return byVendorId;
}

/** The vendor ids whose sessions wrote into `task` at some point - unchanged from before a
 * task could be declared at all, and deliberately still whole-session: nothing about the
 * existing per-file attribution changes for a tool that already has it. */
function inferredVendorIdsForTask(journals, task) {
  const vendorIds = new Set();
  for (const journal of journals) {
    if (!journal.session) continue;
    const tasks = journal.filesWritten.map((written) => taskOf(written.path));
    if (tasks.includes(task)) vendorIds.add(journal.session.vendor_id);
  }
  return vendorIds;
}

/** Both routes to `task`, kept apart rather than merged into one vendor-id set: a declared
 * interval decides per record, at the precision `buildTaskIntervals` bounds it to, while a
 * written file decides for a session's records as a whole, exactly as it always has. Merging
 * them into one set would let a session's own zero-width or long-closed declaration - real,
 * but covering no record - drag in records a written file never touched either. */
function taskMembership(journals, task) {
  return {
    declaredIntervalsByVendorId: declaredIntervalsForTask(journals, task),
    inferredVendorIds: inferredVendorIdsForTask(journals, task),
  };
}

/** Strongest first: a declaration is a flow telling the journal which ticket it is on, and a
 * written file is this layer noticing one on its own - the same ordering `SOURCES` already
 * gives a step, for the same reason. */
const TASK_SOURCES = ["declared", "inferred"];

function fallsWithinDeclaredInterval(record, intervals) {
  if (typeof record.event_timestamp !== "string") return false;
  const ms = Date.parse(record.event_timestamp);
  if (Number.isNaN(ms)) return false;
  return intervals.some((interval) => ms >= interval.startMs && ms < interval.endMs);
}

/** How, if at all, this one record belongs to the task `membership` was built for - `null`
 * for neither route, which is what excludes it from a `--task` report entirely. A record
 * whose own moment falls in a declared interval is `"declared"` even when its session also
 * wrote into the folder; only a record a declaration does not cover falls back to whether
 * its whole session did. */
function taskAttributionOf(record, membership) {
  const intervals = membership.declaredIntervalsByVendorId.get(record.vendor_id);
  if (intervals && fallsWithinDeclaredInterval(record, intervals)) return "declared";
  return membership.inferredVendorIds.has(record.vendor_id) ? "inferred" : null;
}

/** Both sources, always - the same reason `attributionRows` always gives all three: a source
 * that accounted for nothing here is still a fact about this task, not an absent field. */
function taskAttributionRows(taskAttributions) {
  return TASK_SOURCES.map((attribution) => ({
    attribution,
    totals: taskAttributions.get(attribution) ?? newTotals(),
  }));
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
  addTokensOnly(totals, record);
}

// Never touches `requests` or `cost_usd`: a `kind: "session"` local-read total is not a
// billed request, and the tool never states a cost for it (see #697).
function addTokensOnly(totals, record) {
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

// The field a generic filter narrows on, and the fixed order they are applied in - task
// first (it already existed and uses its own membership route, not an equality check),
// then these four, always in the same order, so two people asking for the same selection
// always see the same filter named as the one that emptied it.
const GENERIC_FILTER_FIELDS = { project: "project_id", step: "step", model: "model", tool: "tool" };
const GENERIC_FILTER_ORDER = ["project", "step", "model", "tool"];

/** One stage per active filter, each narrowing what the stage before it kept. Filters
 * compose by `and` and nothing else: every stage only ever removes records the one before
 * it was already going to keep, never adds one back - the report never grows a query
 * language past this. */
function selectionStages(records, input, membership) {
  const stages = [{ name: null, value: undefined, records }];
  if (membership !== null) {
    const kept = records.filter((r) => taskAttributionOf(r, membership) !== null);
    stages.push({ name: "task", value: input.task, records: kept });
  }
  for (const name of GENERIC_FILTER_ORDER) {
    const value = input.filters ? input.filters[name] : undefined;
    if (value === undefined) continue;
    const field = GENERIC_FILTER_FIELDS[name];
    const previous = stages[stages.length - 1].records;
    stages.push({ name, value, records: previous.filter((r) => r[field] === value) });
  }
  return stages;
}

/** Whether a filter's own value is known at all - anywhere this call can see, not only in
 * this selection. `task` reads the same membership `build` already computed for it;
 * `tool` reads the declared list, a closed set no read is needed for; `project`, `step`
 * and `model` read `knownValues`, gathered once per sweep across every day file, not only
 * the period's own records - the same reasoning `sink.js`'s `noteKnownValues` states. */
function isKnownFilterValue(name, value, input, membership) {
  if (name === "task") {
    return membership.declaredIntervalsByVendorId.size > 0 || membership.inferredVendorIds.size > 0;
  }
  if (name === "tool") return input.declaredTools.some((tool) => tool.tool === value);
  const known = input.knownValues ?? { projects: new Set(), steps: new Set(), models: new Set() };
  return known[`${name}s`].has(value);
}

/** True when the culprit filter's own value matched something before any generic filter
 * ran, meaning the emptiness comes from its intersection with a filter already applied
 * rather than from this value alone. `task` has no "alone" reading - it is the only route
 * to a task, not one of several composed equality checks - so it is never a combination. */
function isCombinationCulprit(stages, membership, culprit) {
  if (culprit.name === "task") return false;
  const field = GENERIC_FILTER_FIELDS[culprit.name];
  const baseline = stages[membership === null ? 0 : 1].records;
  return baseline.some((r) => r[field] === culprit.value);
}

/** The first filter that narrowed a non-empty selection down to nothing - never the
 * period itself, which is an honest zero rather than a filter's doing. Stages only ever
 * shrink, so the first empty one is the whole answer to "which filter emptied it". */
function emptySelectionOf(stages, input, membership) {
  if (stages[0].records.length === 0) return undefined;
  const culprit = stages.find((stage) => stage.records.length === 0);
  if (!culprit) return undefined;
  const known = isKnownFilterValue(culprit.name, culprit.value, input, membership);
  const combination = isCombinationCulprit(stages, membership, culprit);
  return { filter: culprit.name, value: culprit.value, known, ...(combination ? { combination: true } : {}) };
}

/** Which of the four generic filters were actually given, in the same fixed order - never
 * `task`, which keeps its own top-level field exactly as before this change. `undefined`
 * when none were, so a report answering an unfiltered period carries no empty object. */
function activeFilters(filters) {
  if (!filters) return undefined;
  const given = GENERIC_FILTER_ORDER.filter((name) => filters[name] !== undefined);
  return given.length === 0 ? undefined : Object.fromEntries(given.map((name) => [name, filters[name]]));
}

/** `by_tool` is a breakdown of every *declared* tool, not only the ones a record touched -
 * that is what lets an unreadable one show its own reason instead of a false zero. A
 * `--tool` filter has to narrow that same list, or every tool it excluded would still
 * print a row reading "nothing in this period" - indistinguishable from one genuinely
 * measured idle, exactly the lie a filter's whole point is to remove. */
function declaredToolsInScope(declaredTools, filters) {
  const wanted = filters ? filters.tool : undefined;
  return wanted === undefined ? declaredTools : declaredTools.filter((tool) => tool.tool === wanted);
}

/**
 * Money and the four token counters come from `kind: "request"` records alone, and active
 * time from `kind: "session"` records alone. The two kinds measure overlapping quantities
 * in incompatible ways, and summing across them counts the same tokens twice while
 * producing a total that looks right.
 */
function build(input) {
  const membership = input.task === undefined ? null : taskMembership(input.journals, input.task);
  const stages = selectionStages(input.records, input, membership);
  const emptySelection = emptySelectionOf(stages, input, membership);
  const records = stages[stages.length - 1].records;

  const totals = newTotals();
  const steps = new Map();
  const models = new Map();
  const tools = new Map();
  const toolSessionTotals = new Map();
  const attributions = new Map();
  const taskAttributions = new Map();
  const projects = new Map();
  const days = new Map();
  for (const day of dayRange(input.fromDay, input.toDay)) days.set(day, newTotals());
  let activeTimeSeconds;

  for (const record of records) {
    if (record.kind === "session") {
      if (typeof record.active_time_s === "number") {
        activeTimeSeconds = (activeTimeSeconds ?? 0) + record.active_time_s;
      }
      // An export-route "session" record is one periodic flush's own delta - never safe
      // to show as if it were the whole session, and left untouched here exactly as
      // before. A local-read "session" record is different in kind, not degree: nothing
      // reads a tool's own file this way except a one-shot, already-complete total (see
      // Copilot, #697), so it is never a delta and never at risk of being summed with a
      // later flush of the same quantity. Kept off `totals`, `by_step` and `by_day`
      // regardless - the two-kinds rule forbids summing it with request lines, and this
      // reconciles with neither.
      if (record.provenance === "local-read") {
        if (!toolSessionTotals.has(record.tool)) toolSessionTotals.set(record.tool, newTotals());
        addTokensOnly(toolSessionTotals.get(record.tool), record);
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
    if (membership !== null) {
      group(taskAttributions, taskAttributionOf(record, membership), record);
    }
  }

  return {
    fromDay: input.fromDay,
    toDay: input.toDay,
    ...(input.task === undefined ? {} : { task: input.task }),
    ...(activeFilters(input.filters) === undefined ? {} : { filters: activeFilters(input.filters) }),
    ...(emptySelection === undefined ? {} : { emptySelection }),
    sessions: new Set(records.map((record) => record.vendor_id)).size,
    totals,
    ...(activeTimeSeconds === undefined ? {} : { activeTimeSeconds }),
    bySteps: stepRows(steps),
    byModels: bySize(
      [...models].map(([model, t]) => ({ model, totals: t })),
      (row) => row.model
    ),
    byTools: toolRows(declaredToolsInScope(input.declaredTools, input.filters), tools, toolSessionTotals),
    byProjects: projectRows(projects),
    byDays: dayRows(days),
    attributionMix: attributionRows(attributions),
    ...(membership === null ? {} : { taskAttributionMix: taskAttributionRows(taskAttributions) }),
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
 * list is one a reader takes for idle, and for an unreadable one that is a false zero.
 * `sessionTotals` is present only for a tool with a local-read `"session"` total to show -
 * today, only Copilot - and never folds into `totals`: the two answer different questions
 * and summing them would answer neither correctly. */
function toolRows(declaredTools, measured, sessionTotals) {
  return declaredTools.map((declaration) => ({
    tool: declaration.tool,
    coverage: declaration.coverage,
    ...(declaration.reason === undefined ? {} : { reason: declaration.reason }),
    capability: declaration.capability,
    totals: measured.get(declaration.tool) ?? newTotals(),
    ...(sessionTotals.has(declaration.tool)
      ? { sessionTotals: sessionTotals.get(declaration.tool) }
      : {}),
  }));
}

module.exports = { build, taskOf, tokensOf, toMicroUsd, buildTaskIntervals, TASK_SOURCES };

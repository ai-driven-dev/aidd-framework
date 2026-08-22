import type { TelemetryRouteSupply } from "../capabilities/telemetry-capability.js";
import { STEP_ATTRIBUTION_SOURCES, type StepAttributionSource } from "./step-attribution.js";
import {
  momentFallsWithin,
  TASK_ATTRIBUTION_SOURCES,
  type TaskAttributionSource,
  type TaskInterval,
} from "./task-attribution.js";
import {
  type TaskIdentity,
  taskIdentitiesFromWrittenPaths,
  taskIdentityFromWrittenPath,
} from "./task-identity.js";
import { type TelemetrySinkRecord, telemetrySinkRecordDayKey } from "./telemetry-sink-record.js";
import type { AiToolId } from "./tool-ids.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Money is carried as whole micro-dollars, never as the floating amount a record stores.
 *
 * The report's whole claim is that its parts add up: the per-step figures plus the
 * unattributed one equal the total, exactly. Floating addition does not have that property
 * - the same amounts summed in two groupings differ in the last bits - so a reconciliation
 * test over floats either fails on noise or is written loosely enough to pass over a real
 * error. Rounding each amount once, on the way in, makes every sum after it exact. The
 * cost is at most half a micro-dollar per record, which no report prints. */
const MICRO_USD_PER_USD = 1e6;

export function toMicroUsd(costUsd: number): number {
  return Math.round(costUsd * MICRO_USD_PER_USD);
}

export function fromMicroUsd(microUsd: number): number {
  return microUsd / MICRO_USD_PER_USD;
}

/** A group's figures. Every counter is optional and an absent one means *never observed*,
 * which is a different fact from zero: a tool whose files carry no amount has an unknown
 * cost, not a free one, and printing the two alike is how a session reads as free.
 * `requests` alone is never absent - it counts records, and a group exists because records
 * are in it. */
export interface CostTotals {
  readonly requests: number;
  readonly costMicroUsd?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheCreationTokens?: number;
}

/** One row of the step breakdown. Keyed by the step *and* the strength of its attribution,
 * never by the step alone: the same skill reached once from the tool's own statement and
 * once from a journal interval is two different claims, and merging them presents an
 * inference as a measurement. `step` is absent exactly when `attribution` is
 * `"unattributed"` - which names what nothing could say, and never says work ran outside
 * every step. */
export interface CostReportStepRow {
  readonly step?: string;
  readonly attribution: StepAttributionSource;
  readonly totals: CostTotals;
}

export interface CostReportModelRow {
  readonly model: string;
  readonly totals: CostTotals;
}

/** Why a tool contributes nothing, when it contributes nothing. `covered` with no records
 * is a tool that could have been read and did nothing in this period; `not-covered` is a
 * tool nothing here can read at all. A consumer prints the second as its reason, never as
 * a zero. */
export type CostReportToolCoverage = "covered" | "not-covered";

/** What a tool was measured to be able to supply, gathered from its own declarations and
 * carried through untouched. It travels beside the figures so a consumer branches on a
 * declared capability rather than on whether a number happened to be present — the
 * inference that turns a limit into a zero. `null` means the route is not declared at all,
 * which is a different fact from a declared route that supplies nothing. */
export interface CostReportToolCapability {
  readonly localRead: TelemetryRouteSupply | null;
  readonly export: TelemetryRouteSupply | null;
  /** Whether the run journal ever names this tool's sessions. False means two things at
   * once, and both matter: no step can be derived from an interval, and a read that sweeps
   * the journal will never reach one of its sessions at all — so a tool can be perfectly
   * readable and still report nothing until someone names a session by hand. Without this,
   * that limit is indistinguishable from a tool that did no work. */
  readonly journalAttributable: boolean;
  readonly taskAttributable: boolean;
}

export interface CostReportToolDeclaration {
  readonly tool: AiToolId;
  readonly coverage: CostReportToolCoverage;
  /** Why it is not covered, or what a covered tool's figures cannot be used for. Comes
   * from the tool's own declaration; this module never writes one. */
  readonly reason?: string;
  readonly capability: CostReportToolCapability;
}

export interface CostReportToolRow {
  readonly tool: AiToolId;
  readonly coverage: CostReportToolCoverage;
  readonly reason?: string;
  readonly capability: CostReportToolCapability;
  readonly totals: CostTotals;
  /** A local-read `kind: "session"` total, present only for a tool whose own file yields a
   * one-shot, already-complete session figure rather than per-request records — today,
   * only Copilot (#697). Never folded into `totals`: it answers "what did this session
   * report" where `totals` answers "what did billed requests sum to", and the two-kinds
   * rule forbids treating one as the other. */
  readonly sessionTotals?: CostTotals;
}

/** How much of the broken-down total each strength accounts for. Printed as three figures
 * rather than as a sentence saying attribution is approximate: three numbers that sum to
 * the total say strictly more, and unlike the sentence they can be asserted. */
export interface CostReportAttributionRow {
  readonly attribution: StepAttributionSource;
  readonly totals: CostTotals;
}

/** The same idea as `CostReportAttributionRow`, one axis over: how much of a `--task`
 * report's total came from a declared interval versus a written file. */
export interface CostReportTaskAttributionRow {
  readonly attribution: TaskAttributionSource;
  readonly totals: CostTotals;
}

/** One project's figures, largest first, plus one row for what named none — `project`
 * absent there, the same convention `CostReportStepRow` uses for `unattributed`. Never
 * folded into a neighbour: that would place a figure that was never placed. */
export interface CostReportProjectRow {
  readonly project?: string;
  readonly totals: CostTotals;
}

/** One UTC day's figures, in chronological order — every day the period spans, whether or
 * not a record landed on it. A day with nothing is a row of zeros: the one place in this
 * report a zero is the measurement rather than the false reading this layer exists to
 * refuse, because an omitted row would read as continuity a gap is not. */
export interface CostReportDayRow {
  readonly day: string;
  readonly totals: CostTotals;
}

/** One session's journal, reduced to what a report needs. Assembling it from the run
 * journal is the caller's job; this module never opens a file - `taskIntervals` comes
 * straight from `buildTaskIntervals`, already built once per session rather than re-derived
 * per record. */
export interface CostReportSessionJournal {
  readonly vendorId: string;
  readonly tool: string;
  readonly projectId?: string;
  readonly writtenPaths: readonly string[];
  readonly taskIntervals: readonly TaskInterval[];
}

/** The four dimensions that narrow on an equal record field - `task` keeps its own route
 * and its own top-level field, exactly as before this type existed. Every one composes
 * with the others, and with `task`, by `and`: two given narrow to their intersection,
 * never their union. */
export interface CostReportFilters {
  readonly project?: string;
  readonly step?: string;
  readonly model?: string;
  readonly tool?: string;
}

export type CostReportFilterName = keyof CostReportFilters | "task";

/** Every value a filterable field has carried, anywhere the caller looked - not only in
 * the period this report answers. What lets an empty selection tell a value nobody ever
 * recorded apart from one that simply had no work here. */
export interface CostReportKnownValues {
  readonly projects: ReadonlySet<string>;
  readonly steps: ReadonlySet<string>;
  readonly models: ReadonlySet<string>;
}

/** The filter that narrowed a non-empty selection down to nothing - never the period
 * itself, which is an honest zero rather than a filter's doing. `known` says whether the
 * value was ever seen anywhere this call could look; `combination` is present only when
 * the value matched something before any generic filter ran, so the emptiness comes from
 * its intersection with a filter already applied rather than from the value alone. */
export interface CostReportEmptySelection {
  readonly filter: CostReportFilterName;
  readonly value: string;
  readonly known: boolean;
  readonly combination?: boolean;
}

export interface CostReportInput {
  readonly fromDay: string;
  readonly toDay: string;
  readonly records: readonly TelemetrySinkRecord[];
  readonly journals: readonly CostReportSessionJournal[];
  readonly declaredTools: readonly CostReportToolDeclaration[];
  /** Records carrying no moment at all - counted and named, never placed in the period. */
  readonly undatedRecords: number;
  /** Lines the read could not parse. A report built from a partial read looks exactly like
   * one built from a whole read unless this travels with it. */
  readonly unreadableLines: number;
  /** Restrict to the sessions that wrote into this task. Absent means the whole period,
   * which is the primary question: a task is a filter over a period, and work that touched
   * no task folder is still fully reportable. */
  readonly task?: TaskIdentity;
  /** Any of `project`, `step`, `model` and `tool`, each optional and composing with `task`
   * and each other by `and`. */
  readonly filters?: CostReportFilters;
  /** Where a generic filter's value has ever been seen - absent when the caller has none
   * to offer, which reads the same as a filter never matching it elsewhere. */
  readonly knownValues?: CostReportKnownValues;
}

export interface CostReport {
  readonly fromDay: string;
  readonly toDay: string;
  readonly task?: TaskIdentity;
  /** Only the generic filters actually given, in a fixed order - `task` keeps its own
   * field above, unchanged. Absent for an unfiltered period. */
  readonly filters?: CostReportFilters;
  /** Present only when a filter - never the period itself - is what emptied this
   * selection. */
  readonly emptySelection?: CostReportEmptySelection;
  readonly sessions: number;
  readonly totals: CostTotals;
  /** Per session, from `kind: "session"` records alone, and never broken down by step: no
   * active-time measure on any tool carries a step attribute, so any share in a per-step
   * breakdown is cost, never time. Absent when no record carried it. */
  readonly activeTimeSeconds?: number;
  readonly bySteps: readonly CostReportStepRow[];
  readonly byModels: readonly CostReportModelRow[];
  readonly byTools: readonly CostReportToolRow[];
  readonly byProjects: readonly CostReportProjectRow[];
  readonly byDays: readonly CostReportDayRow[];
  readonly attributionMix: readonly CostReportAttributionRow[];
  /** Present only alongside `task`: an unfiltered period carries no per-record task identity
   * to break down (see metrics-contract.md's "Attributing records to a task"). */
  readonly taskAttributionMix?: readonly CostReportTaskAttributionRow[];
  readonly undatedRecords: number;
  readonly unreadableLines: number;
}

// Declared as the list first and the type derived from it, rather than the other way
// round: reading the keys back off the table would have to assert their type, and an
// assertion is exactly what stops holding the day the table and the type disagree.
const COUNTER_FIELDS = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheCreationTokens",
] as const;

type CounterField = (typeof COUNTER_FIELDS)[number];

const COUNTER_SOURCE: Readonly<Record<CounterField, keyof TelemetrySinkRecord>> = {
  inputTokens: "input_tokens",
  outputTokens: "output_tokens",
  cacheReadTokens: "cache_read_tokens",
  cacheCreationTokens: "cache_creation_tokens",
};

/** Accumulates a group while keeping "never observed" distinct from "observed as zero".
 * A field stays absent until some record in the group carries it. */
class TotalsAccumulator {
  private requests = 0;
  private costMicroUsd: number | undefined;
  private readonly counters = new Map<CounterField, number>();

  add(record: TelemetrySinkRecord): void {
    this.requests += 1;
    if (record.cost_usd !== undefined) {
      this.costMicroUsd = (this.costMicroUsd ?? 0) + toMicroUsd(record.cost_usd);
    }
    this.addTokensOnly(record);
  }

  /** Never touches `requests` or `cost_usd`: a `kind: "session"` local-read total is not a
   * billed request, and the tool never states a cost for one (see #697). */
  addTokensOnly(record: TelemetrySinkRecord): void {
    for (const field of COUNTER_FIELDS) {
      const value = record[COUNTER_SOURCE[field]];
      if (typeof value === "number") {
        this.counters.set(field, (this.counters.get(field) ?? 0) + value);
      }
    }
  }

  build(): CostTotals {
    const counters: Partial<Record<CounterField, number>> = {};
    for (const field of COUNTER_FIELDS) {
      const value = this.counters.get(field);
      if (value !== undefined) counters[field] = value;
    }
    return {
      requests: this.requests,
      ...(this.costMicroUsd === undefined ? {} : { costMicroUsd: this.costMicroUsd }),
      ...counters,
    };
  }
}

function accumulateInto<K>(
  groups: Map<K, TotalsAccumulator>,
  key: K,
  record: TelemetrySinkRecord,
  apply: (accumulator: TotalsAccumulator) => void = (accumulator) => accumulator.add(record)
): void {
  const existing = groups.get(key);
  if (existing) {
    apply(existing);
    return;
  }
  const created = new TotalsAccumulator();
  apply(created);
  groups.set(key, created);
}

/** Largest first, so the biggest thing is the first thing read. Weighted by amount where
 * one exists and by tokens where none does, since a tool with no amount would otherwise
 * sort as if it had cost nothing. Ties fall back to the row's own key, so the same records
 * always produce the same report. */
function bySize<T>(
  rows: readonly T[],
  totalsOf: (row: T) => CostTotals,
  keyOf: (row: T) => string
): T[] {
  const weight = (row: T): number => {
    const totals = totalsOf(row);
    return totals.costMicroUsd ?? (totals.inputTokens ?? 0) + (totals.outputTokens ?? 0);
  };
  return [...rows].sort(
    (left, right) => weight(right) - weight(left) || keyOf(left).localeCompare(keyOf(right))
  );
}

// A single space cannot occur in a `step_attribution` value, so it separates the two parts
// of the key unambiguously even though a skill name could contain almost anything. The
// group keeps the two parts beside its counters rather than parsing them back out of the
// key: reading a type back out of a string is an assertion, and this needs none.
const STEP_ROW_SEPARATOR = " ";

interface StepGroup {
  readonly attribution: StepAttributionSource;
  readonly step?: string;
  readonly totals: TotalsAccumulator;
}

function stepRowKey(record: TelemetrySinkRecord): string {
  return `${record.step_attribution}${STEP_ROW_SEPARATOR}${record.step ?? ""}`;
}

function addToStepGroup(groups: Map<string, StepGroup>, record: TelemetrySinkRecord): void {
  const key = stepRowKey(record);
  const existing = groups.get(key);
  if (existing) {
    existing.totals.add(record);
    return;
  }
  const created: StepGroup = {
    attribution: record.step_attribution,
    ...(record.step === undefined ? {} : { step: record.step }),
    totals: new TotalsAccumulator(),
  };
  created.totals.add(record);
  groups.set(key, created);
}

// A record with no project is its own group, never folded into one that was actually
// placed. A symbol can never equal a real `project_id` string, so it is a safe Map key
// for "unknown" beside every value a record might actually carry.
const NO_KNOWN_PROJECT = Symbol("no known project");
type ProjectKey = string | typeof NO_KNOWN_PROJECT;

function projectKeyOf(record: TelemetrySinkRecord): ProjectKey {
  return record.project_id ?? NO_KNOWN_PROJECT;
}

/** Every UTC day from `fromDay` to `toDay`, inclusive — the full period, whether or not a
 * record ever lands on a given day. A day with nothing is still a row: a gap in a series
 * reads as continuity, so the row has to exist to be a zero. */
function dayRange(fromDay: string, toDay: string): readonly string[] {
  const days: string[] = [];
  const end = Date.parse(`${toDay}T00:00:00Z`);
  for (let at = Date.parse(`${fromDay}T00:00:00Z`); at <= end; at += MS_PER_DAY) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}

/** The vendor ids whose sessions wrote into `task` at some point - unchanged from before a
 * task could be declared at all, and deliberately still whole-session: nothing about the
 * existing per-file attribution changes for a tool that already has it. */
function inferredVendorIdsForTask(
  journals: readonly CostReportSessionJournal[],
  task: TaskIdentity
): ReadonlySet<string> {
  const vendorIds = new Set<string>();
  for (const journal of journals) {
    if (taskIdentitiesFromWrittenPaths(journal.writtenPaths).includes(task)) {
      vendorIds.add(journal.vendorId);
    }
  }
  return vendorIds;
}

/** Every session's own declared intervals that name `task`, keyed by vendor id so a
 * record's session is a lookup rather than a walk of every journal again. A session that
 * never declared this task carries no entry - what makes an undeclared session read as
 * belonging to none, never to the last one seen. */
function declaredIntervalsForTask(
  journals: readonly CostReportSessionJournal[],
  task: TaskIdentity
): ReadonlyMap<string, readonly TaskInterval[]> {
  const byVendorId = new Map<string, readonly TaskInterval[]>();
  for (const journal of journals) {
    const intervals = journal.taskIntervals.filter(
      (interval) => taskIdentityFromWrittenPath(interval.path) === task
    );
    if (intervals.length > 0) byVendorId.set(journal.vendorId, intervals);
  }
  return byVendorId;
}

/** Both routes to `task`, kept apart rather than merged into one vendor-id set: a declared
 * interval decides per record, at the precision `buildTaskIntervals` bounds it to, while a
 * written file decides for a session's records as a whole, exactly as it always has.
 * Merging them would let a session's own zero-width or long-closed declaration - real, but
 * covering no record - drag in records a written file never touched either. */
interface TaskMembership {
  readonly declaredIntervalsByVendorId: ReadonlyMap<string, readonly TaskInterval[]>;
  readonly inferredVendorIds: ReadonlySet<string>;
}

function taskMembership(
  journals: readonly CostReportSessionJournal[],
  task: TaskIdentity
): TaskMembership {
  return {
    declaredIntervalsByVendorId: declaredIntervalsForTask(journals, task),
    inferredVendorIds: inferredVendorIdsForTask(journals, task),
  };
}

/** How, if at all, one record belongs to the task `membership` was built for - `undefined`
 * for neither route, which is what excludes it from a `--task` report entirely. A record
 * whose own moment falls in a declared interval is `"declared"` even when its session also
 * wrote into the folder; only a record a declaration does not cover falls back to whether
 * its whole session did. */
function taskAttributionOf(
  record: TelemetrySinkRecord,
  membership: TaskMembership
): TaskAttributionSource | undefined {
  const intervals = membership.declaredIntervalsByVendorId.get(record.vendor_id);
  if (intervals && momentFallsWithin(intervals, record.event_timestamp)) return "declared";
  return membership.inferredVendorIds.has(record.vendor_id) ? "inferred" : undefined;
}

// The field a generic filter narrows on, and the fixed order they are applied in - after
// `task`, which already existed and uses its own membership route rather than an equality
// check. Fixed so two people asking for the same selection always see the same filter
// named as the one that emptied it.
const GENERIC_FILTER_FIELDS: Readonly<Record<keyof CostReportFilters, keyof TelemetrySinkRecord>> =
  {
    project: "project_id",
    step: "step",
    model: "model",
    tool: "tool",
  };
const GENERIC_FILTER_ORDER: readonly (keyof CostReportFilters)[] = [
  "project",
  "step",
  "model",
  "tool",
];

interface SelectionStage {
  readonly name: CostReportFilterName | undefined;
  readonly value: string | undefined;
  readonly records: readonly TelemetrySinkRecord[];
}

/** One stage per active filter, each narrowing what the stage before it kept. Filters
 * compose by `and` and nothing else: every stage only ever removes records the one before
 * it was already going to keep, never adds one back. */
function selectionStages(
  records: readonly TelemetrySinkRecord[],
  input: CostReportInput,
  membership: TaskMembership | null
): readonly SelectionStage[] {
  const stages: SelectionStage[] = [{ name: undefined, value: undefined, records }];
  if (membership !== null) {
    const kept = records.filter((r) => taskAttributionOf(r, membership) !== undefined);
    stages.push({ name: "task", value: input.task, records: kept });
  }
  for (const name of GENERIC_FILTER_ORDER) {
    const value = input.filters?.[name];
    if (value === undefined) continue;
    const field = GENERIC_FILTER_FIELDS[name];
    const previous = stages[stages.length - 1]?.records ?? [];
    stages.push({ name, value, records: previous.filter((r) => r[field] === value) });
  }
  return stages;
}

/** Whether a filter's own value is known at all - anywhere this call can see, not only in
 * this selection. `task` reads the same membership `buildCostReport` already computed;
 * `tool` reads the declared list, a closed set no read is needed for; the rest read
 * `knownValues`, gathered once across every day file the caller looked at, not only the
 * period's own records. */
function isKnownFilterValue(
  name: CostReportFilterName,
  value: string,
  input: CostReportInput,
  membership: TaskMembership | null
): boolean {
  if (name === "task") {
    return (
      (membership?.declaredIntervalsByVendorId.size ?? 0) > 0 ||
      (membership?.inferredVendorIds.size ?? 0) > 0
    );
  }
  if (name === "tool") return input.declaredTools.some((tool) => tool.tool === value);
  const known = input.knownValues ?? { projects: new Set(), steps: new Set(), models: new Set() };
  const set = { project: known.projects, step: known.steps, model: known.models }[name];
  return set?.has(value) ?? false;
}

/** True when the culprit filter's own value matched something before any generic filter
 * ran, meaning the emptiness comes from its intersection with a filter already applied
 * rather than from this value alone. `task` has no "alone" reading - it is the only route
 * to a task, not one of several composed equality checks. */
function isCombinationCulprit(
  stages: readonly SelectionStage[],
  membership: TaskMembership | null,
  culprit: SelectionStage
): boolean {
  if (culprit.name === undefined || culprit.name === "task") return false;
  const field = GENERIC_FILTER_FIELDS[culprit.name];
  const baseline = stages[membership === null ? 0 : 1]?.records ?? [];
  return baseline.some((r) => r[field] === culprit.value);
}

/** The first filter that narrowed a non-empty selection down to nothing - never the
 * period itself, which is an honest zero rather than a filter's doing. Stages only ever
 * shrink, so the first empty one is the whole answer to "which filter emptied it". */
function emptySelectionOf(
  stages: readonly SelectionStage[],
  input: CostReportInput,
  membership: TaskMembership | null
): CostReportEmptySelection | undefined {
  if ((stages[0]?.records.length ?? 0) === 0) return undefined;
  const culprit = stages.find((stage) => stage.records.length === 0);
  if (!culprit || culprit.name === undefined || culprit.value === undefined) return undefined;
  const known = isKnownFilterValue(culprit.name, culprit.value, input, membership);
  const combination = isCombinationCulprit(stages, membership, culprit);
  return {
    filter: culprit.name,
    value: culprit.value,
    known,
    ...(combination ? { combination: true } : {}),
  };
}

/** Which of the four generic filters were actually given, in the same fixed order - never
 * `task`, which keeps its own top-level field unchanged. `undefined` when none were, so
 * an unfiltered period carries no empty object. */
function activeFilters(filters: CostReportFilters | undefined): CostReportFilters | undefined {
  if (!filters) return undefined;
  const given = GENERIC_FILTER_ORDER.filter((name) => filters[name] !== undefined);
  if (given.length === 0) return undefined;
  return Object.fromEntries(given.map((name) => [name, filters[name]]));
}

/** `by_tool` is a breakdown of every *declared* tool, not only the ones a record touched -
 * that is what lets an unreadable one show its own reason instead of a false zero. A
 * `--tool` filter has to narrow that same list, or every tool it excluded would still
 * print a row reading "nothing in this period" - indistinguishable from one genuinely
 * measured idle, exactly the lie a filter's whole point is to remove. */
function declaredToolsInScope(
  declaredTools: readonly CostReportToolDeclaration[],
  filters: CostReportFilters | undefined
): readonly CostReportToolDeclaration[] {
  const wanted = filters?.tool;
  return wanted === undefined
    ? declaredTools
    : declaredTools.filter((tool) => tool.tool === wanted);
}

/** Every declared tool gets a row, in the declared order, whether or not it contributed -
 * a tool absent from the output is a tool a reader assumes did nothing, and for an
 * unreadable one that assumption is exactly the false zero this layer exists to prevent. */
function buildToolRows(
  declaredTools: readonly CostReportToolDeclaration[],
  measured: ReadonlyMap<AiToolId, TotalsAccumulator>,
  sessionTotals: ReadonlyMap<AiToolId, TotalsAccumulator>
): readonly CostReportToolRow[] {
  return declaredTools.map((declaration) => {
    const session = sessionTotals.get(declaration.tool);
    return {
      tool: declaration.tool,
      coverage: declaration.coverage,
      ...(declaration.reason === undefined ? {} : { reason: declaration.reason }),
      capability: declaration.capability,
      totals: measured.get(declaration.tool)?.build() ?? { requests: 0 },
      ...(session === undefined ? {} : { sessionTotals: session.build() }),
    };
  });
}

/**
 * One period's records and journals, reduced to a report whose every breakdown sums to the
 * total it belongs to.
 *
 * Pure: everything it needs arrives as data, including which tools are covered - so this
 * module names no tool and no skill, and a fifth tool changes a declaration rather than
 * this file. The two rules it exists to enforce come from
 * `aidd_docs/product/metrics-contract.md`, and this is the first thing in the codebase
 * that could break either: money and the four token counters come from `kind: "request"`
 * records alone, and active time from `kind: "session"` records alone. Summing across the
 * two kinds counts the same tokens twice and produces a total that looks right.
 */
/** Every group one pass over the records fills. Kept together so the pass reads as one
 * decision per record rather than as five parallel loops over the same list. */
interface Groups {
  readonly totals: TotalsAccumulator;
  readonly steps: Map<string, StepGroup>;
  readonly models: Map<string, TotalsAccumulator>;
  readonly tools: Map<AiToolId, TotalsAccumulator>;
  readonly toolSessionTotals: Map<AiToolId, TotalsAccumulator>;
  readonly attributions: Map<StepAttributionSource, TotalsAccumulator>;
  readonly taskAttributions: Map<TaskAttributionSource, TotalsAccumulator>;
  readonly projects: Map<ProjectKey, TotalsAccumulator>;
  readonly days: Map<string, TotalsAccumulator>;
  activeTimeSeconds?: number;
}

function emptyGroups(fromDay: string, toDay: string): Groups {
  const days = new Map<string, TotalsAccumulator>();
  for (const day of dayRange(fromDay, toDay)) days.set(day, new TotalsAccumulator());
  return {
    totals: new TotalsAccumulator(),
    steps: new Map(),
    models: new Map(),
    tools: new Map(),
    toolSessionTotals: new Map(),
    attributions: new Map(),
    taskAttributions: new Map(),
    projects: new Map(),
    days,
  };
}

/** Active time is the one quantity taken from the `"session"` kind, and the only one: no
 * `"request"` record on any tool measured so far carries it, and no `"session"` record's
 * money or tokens are ever added to a total, since they are a flush window's own delta of
 * quantities the request records already report in full. */
// An export-route "session" record is one periodic flush's own delta - never safe to show
// as if it were the whole session, and left untouched exactly as before. A local-read
// "session" record is different in kind, not degree: nothing reads a tool's own file this
// way except a one-shot, already-complete total (see Copilot, #697), so it is never at risk
// of being summed with a later flush of the same quantity. Kept off `totals`, `bySteps` and
// `byDays` regardless - the two-kinds rule forbids summing it with request lines.
function accumulateSessionRecord(groups: Groups, record: TelemetrySinkRecord): void {
  if (record.active_time_s !== undefined) {
    groups.activeTimeSeconds = (groups.activeTimeSeconds ?? 0) + record.active_time_s;
  }
  if (record.provenance === "local-read") {
    accumulateInto(groups.toolSessionTotals, record.tool, record, (accumulator) =>
      accumulator.addTokensOnly(record)
    );
  }
}

function accumulateRequestRecord(
  groups: Groups,
  record: TelemetrySinkRecord,
  membership: TaskMembership | null
): void {
  groups.totals.add(record);
  addToStepGroup(groups.steps, record);
  accumulateInto(groups.attributions, record.step_attribution, record);
  accumulateInto(groups.tools, record.tool, record);
  if (record.model !== undefined) accumulateInto(groups.models, record.model, record);
  accumulateInto(groups.projects, projectKeyOf(record), record);
  const day = telemetrySinkRecordDayKey(record);
  if (day !== undefined && groups.days.has(day)) groups.days.get(day)?.add(record);
  const attribution = membership === null ? undefined : taskAttributionOf(record, membership);
  if (attribution !== undefined) accumulateInto(groups.taskAttributions, attribution, record);
}

function accumulate(
  records: readonly TelemetrySinkRecord[],
  fromDay: string,
  toDay: string,
  membership: TaskMembership | null
): Groups {
  const groups = emptyGroups(fromDay, toDay);
  for (const record of records) {
    if (record.kind === "session") {
      accumulateSessionRecord(groups, record);
      continue;
    }
    accumulateRequestRecord(groups, record, membership);
  }
  return groups;
}

/** All three, always, in the declared order.
 *
 * A strength that accounted for nothing is the one place in this report where a zero is
 * the measurement rather than an absence: the total is known, and none of it came from
 * that source. Dropping the row would leave a consumer handling one to three rows in an
 * order it cannot predict, and unable to tell "no records were attributed this way" from
 * "this report does not carry that field". */
function attributionRows(
  attributions: ReadonlyMap<StepAttributionSource, TotalsAccumulator>
): readonly CostReportAttributionRow[] {
  return STEP_ATTRIBUTION_SOURCES.map((attribution) => ({
    attribution,
    totals: attributions.get(attribution)?.build() ?? { requests: 0 },
  }));
}

/** Both sources, always - the same reason `attributionRows` always gives all three: a
 * source that accounted for nothing is still a fact about this task, not an absent field. */
function taskAttributionRows(
  taskAttributions: ReadonlyMap<TaskAttributionSource, TotalsAccumulator>
): readonly CostReportTaskAttributionRow[] {
  return TASK_ATTRIBUTION_SOURCES.map((attribution) => ({
    attribution,
    totals: taskAttributions.get(attribution)?.build() ?? { requests: 0 },
  }));
}

function stepRows(steps: ReadonlyMap<string, StepGroup>): readonly CostReportStepRow[] {
  const rows: CostReportStepRow[] = [...steps.values()].map((group) => ({
    attribution: group.attribution,
    ...(group.step === undefined ? {} : { step: group.step }),
    totals: group.totals.build(),
  }));
  return bySize(
    rows,
    (row) => row.totals,
    (row) => `${row.step ?? ""}/${row.attribution}`
  );
}

/** Every project a record named, largest first, plus one row for what named none. */
function projectRows(
  projects: ReadonlyMap<ProjectKey, TotalsAccumulator>
): readonly CostReportProjectRow[] {
  const rows: CostReportProjectRow[] = [...projects].map(([key, accumulator]) => ({
    ...(key === NO_KNOWN_PROJECT ? {} : { project: key }),
    totals: accumulator.build(),
  }));
  return bySize(
    rows,
    (row) => row.totals,
    (row) => row.project ?? ""
  );
}

/** Every day in the period, in order — never sorted by size, unlike every other breakdown
 * here. A series read out of order is not a series. */
function dayRows(days: ReadonlyMap<string, TotalsAccumulator>): readonly CostReportDayRow[] {
  return [...days].map(([day, accumulator]) => ({ day, totals: accumulator.build() }));
}

function modelRows(models: ReadonlyMap<string, TotalsAccumulator>): readonly CostReportModelRow[] {
  const rows = [...models].map(([model, accumulator]) => ({
    model,
    totals: accumulator.build(),
  }));
  return bySize(
    rows,
    (row) => row.totals,
    (row) => row.model
  );
}

/**
 * One period's records and journals, reduced to a report whose every breakdown sums to the
 * total it belongs to.
 *
 * Pure: everything it needs arrives as data, including which tools are covered - so this
 * module names no tool and no skill, and a fifth tool changes a declaration rather than
 * this file. The two rules it exists to enforce come from
 * `aidd_docs/product/metrics-contract.md`, and this is the first thing in the codebase
 * that could break either: money and the four token counters come from `kind: "request"`
 * records alone, and active time from `kind: "session"` records alone. Summing across the
 * two kinds counts the same tokens twice and produces a total that looks right.
 */
/** `task`, `filters` and `emptySelection` together - the selection this report answered,
 * as opposed to the figures it answered with. Pulled out on its own so the object literal
 * below reads as one shape, not a wall of conditional spreads. */
function selectionFields(
  input: CostReportInput,
  emptySelection: CostReportEmptySelection | undefined
): Pick<CostReport, "task" | "filters" | "emptySelection"> {
  const filters = activeFilters(input.filters);
  return {
    ...(input.task === undefined ? {} : { task: input.task }),
    ...(filters === undefined ? {} : { filters }),
    ...(emptySelection === undefined ? {} : { emptySelection }),
  };
}

function toolRowsInScope(input: CostReportInput, groups: Groups): readonly CostReportToolRow[] {
  return buildToolRows(
    declaredToolsInScope(input.declaredTools, input.filters),
    groups.tools,
    groups.toolSessionTotals
  );
}

function assembleCostReport(
  input: CostReportInput,
  inScope: readonly TelemetrySinkRecord[],
  groups: Groups,
  membership: TaskMembership | null,
  emptySelection: CostReportEmptySelection | undefined
): CostReport {
  return {
    fromDay: input.fromDay,
    toDay: input.toDay,
    ...selectionFields(input, emptySelection),
    sessions: new Set(inScope.map((record) => record.vendor_id)).size,
    totals: groups.totals.build(),
    ...(groups.activeTimeSeconds === undefined
      ? {}
      : { activeTimeSeconds: groups.activeTimeSeconds }),
    bySteps: stepRows(groups.steps),
    byModels: modelRows(groups.models),
    byTools: toolRowsInScope(input, groups),
    byProjects: projectRows(groups.projects),
    byDays: dayRows(groups.days),
    attributionMix: attributionRows(groups.attributions),
    ...(membership === null
      ? {}
      : { taskAttributionMix: taskAttributionRows(groups.taskAttributions) }),
    undatedRecords: input.undatedRecords,
    unreadableLines: input.unreadableLines,
  };
}

export function buildCostReport(input: CostReportInput): CostReport {
  const membership = input.task === undefined ? null : taskMembership(input.journals, input.task);
  const stages = selectionStages(input.records, input, membership);
  const emptySelection = emptySelectionOf(stages, input, membership);
  const inScope = stages[stages.length - 1]?.records ?? [];
  const groups = accumulate(inScope, input.fromDay, input.toDay, membership);

  return assembleCostReport(input, inScope, groups, membership, emptySelection);
}

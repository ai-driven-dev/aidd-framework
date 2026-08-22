import type { TelemetryRouteSupply } from "../capabilities/telemetry-capability.js";
import { STEP_ATTRIBUTION_SOURCES, type StepAttributionSource } from "./step-attribution.js";
import { type TaskIdentity, taskIdentitiesFromWrittenPaths } from "./task-identity.js";
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
}

/** How much of the broken-down total each strength accounts for. Printed as three figures
 * rather than as a sentence saying attribution is approximate: three numbers that sum to
 * the total say strictly more, and unlike the sentence they can be asserted. */
export interface CostReportAttributionRow {
  readonly attribution: StepAttributionSource;
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
 * journal is the caller's job; this module never opens a file. */
export interface CostReportSessionJournal {
  readonly vendorId: string;
  readonly tool: string;
  readonly projectId?: string;
  readonly writtenPaths: readonly string[];
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
}

export interface CostReport {
  readonly fromDay: string;
  readonly toDay: string;
  readonly task?: TaskIdentity;
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
  record: TelemetrySinkRecord
): void {
  const existing = groups.get(key);
  if (existing) {
    existing.add(record);
    return;
  }
  const created = new TotalsAccumulator();
  created.add(record);
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

/** The vendor ids whose sessions wrote into `task`. A journal that wrote into no task
 * folder matches no task, and is simply absent from a task-filtered report - never folded
 * into one because it happened at the same time. */
function vendorIdsForTask(
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

/** Every declared tool gets a row, in the declared order, whether or not it contributed -
 * a tool absent from the output is a tool a reader assumes did nothing, and for an
 * unreadable one that assumption is exactly the false zero this layer exists to prevent. */
function buildToolRows(
  declaredTools: readonly CostReportToolDeclaration[],
  measured: ReadonlyMap<AiToolId, TotalsAccumulator>
): readonly CostReportToolRow[] {
  return declaredTools.map((declaration) => ({
    tool: declaration.tool,
    coverage: declaration.coverage,
    ...(declaration.reason === undefined ? {} : { reason: declaration.reason }),
    capability: declaration.capability,
    totals: measured.get(declaration.tool)?.build() ?? { requests: 0 },
  }));
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
  readonly attributions: Map<StepAttributionSource, TotalsAccumulator>;
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
    attributions: new Map(),
    projects: new Map(),
    days,
  };
}

/** Active time is the one quantity taken from the `"session"` kind, and the only one: no
 * `"request"` record on any tool measured so far carries it, and no `"session"` record's
 * money or tokens are ever added to a total, since they are a flush window's own delta of
 * quantities the request records already report in full. */
function accumulate(
  records: readonly TelemetrySinkRecord[],
  fromDay: string,
  toDay: string
): Groups {
  const groups = emptyGroups(fromDay, toDay);
  for (const record of records) {
    if (record.kind === "session") {
      if (record.active_time_s !== undefined) {
        groups.activeTimeSeconds = (groups.activeTimeSeconds ?? 0) + record.active_time_s;
      }
      continue;
    }
    groups.totals.add(record);
    addToStepGroup(groups.steps, record);
    accumulateInto(groups.attributions, record.step_attribution, record);
    accumulateInto(groups.tools, record.tool, record);
    if (record.model !== undefined) accumulateInto(groups.models, record.model, record);
    accumulateInto(groups.projects, projectKeyOf(record), record);
    const day = telemetrySinkRecordDayKey(record);
    if (day !== undefined && groups.days.has(day)) groups.days.get(day)?.add(record);
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
export function buildCostReport(input: CostReportInput): CostReport {
  const wanted = input.task === undefined ? null : vendorIdsForTask(input.journals, input.task);
  const inScope = input.records.filter((record) => wanted === null || wanted.has(record.vendor_id));
  const groups = accumulate(inScope, input.fromDay, input.toDay);

  return {
    fromDay: input.fromDay,
    toDay: input.toDay,
    ...(input.task === undefined ? {} : { task: input.task }),
    sessions: new Set(inScope.map((record) => record.vendor_id)).size,
    totals: groups.totals.build(),
    ...(groups.activeTimeSeconds === undefined
      ? {}
      : { activeTimeSeconds: groups.activeTimeSeconds }),
    bySteps: stepRows(groups.steps),
    byModels: modelRows(groups.models),
    byTools: buildToolRows(input.declaredTools, groups.tools),
    byProjects: projectRows(groups.projects),
    byDays: dayRows(groups.days),
    attributionMix: attributionRows(groups.attributions),
    undatedRecords: input.undatedRecords,
    unreadableLines: input.unreadableLines,
  };
}

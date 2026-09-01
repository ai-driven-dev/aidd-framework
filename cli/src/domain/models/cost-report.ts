import type { TelemetryRouteSupply } from "../capabilities/telemetry-capability.js";
import type { PersonIdentity } from "../ports/person-identity-reader.js";
import type { FlowInterval } from "./flow-attribution.js";
import { type PersonResolution, type ResolvedPerson, resolvePerson } from "./person-resolution.js";
import { STEP_ATTRIBUTION_SOURCES, type StepAttributionSource } from "./step-attribution.js";
import {
  momentFallsWithin,
  TASK_ATTRIBUTION_SOURCES,
  TASK_UNATTRIBUTED_REASONS,
  type TaskAttributionSource,
  type TaskInterval,
  type TaskUnattributedReason,
  taskUnattributedReason,
} from "./task-attribution.js";
import type { TaskBacklogDeclaration } from "./task-backlog-link.js";
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

/** One model's figures, largest first, plus one row for what named none - `model` absent
 * there, the same convention `CostReportProjectRow` uses for what named no project. Both
 * the Codex and OpenCode readers permit a request record with no model, so this row is what
 * lets `byModels` keep reconciling to the total exactly the way `bySteps`'s `unattributed`
 * and `byProjects`'s unknown row already do. */
export interface CostReportModelRow {
  readonly model?: string;
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
   * only Copilot. Never folded into `totals`: it answers "what did this session
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

/** One framework task's figures, keyed on the declared interval a record's own moment
 * falls in - never on a session's whole-session written-path inference, which is the
 * `--task` filter's own, separate route and would let one session's records land in more
 * than one row. `attribution` is always `"declared"` where `task` is present, since a
 * closed interval is the only route this breakdown reads; it travels anyway so a consumer
 * never has to assume a strength this object does not state.
 *
 * A record that fell in no declared interval carries `reason` instead of `task` -
 * `TaskUnattributedReason` names which of three distinct facts applies, never one label
 * standing in for all three: no usable task declaration exists in that record's session; a
 * task was declared but this record precedes it (whether every declaration, or the gap a `turn_end`
 * leaves before the next one); or a task was declared and the journal's own declared
 * coverage runs out before this record's moment. Never for a written file this breakdown
 * does not consult, and never split from a declaration the journal simply could not read:
 * the journal records a `task_declared` line or it does not, and those two read as
 * `"no-declaration"` alike. Up to three such rows can appear in one period, one per reason
 * actually present - never collapsed into one, since two different gaps are not one gap.
 * Sorted apart from every other breakdown: largest first among named tasks, with every
 * reason row last, in `TASK_UNATTRIBUTED_REASONS`' own fixed order, so a reader sees tasks
 * before the remainder and the remainder in the same order every time. */
export interface CostReportTaskRow {
  readonly task?: TaskIdentity;
  readonly attribution?: TaskAttributionSource;
  readonly reason?: TaskUnattributedReason;
  readonly totals: CostTotals;
}

/** One backlog item's figures — grouped one level above `CostReportTaskRow`: every task
 * declaring the same item lands in one row, which is the whole point of this axis (`--task`
 * still answers "this task cost X"; this answers "this backlog item cost X"). Composes on
 * the same per-record task membership `byTasks` already computes, resolved once per task
 * folder rather than per record - see `report-cost-use-case.ts`.
 *
 * `backlog` is present only for a record whose task declares an item. Where it is absent,
 * exactly one of `declaration` or `reason` says why, and never both:
 *
 * - `declaration: "none"` — the record's task exists and is known, but its folder declares
 *   no backlog item. A normal state, its own row, distinct from a record belonging to no
 *   task at all.
 * - `declaration: "unreadable"` — the record's task folder's declaration exists but could
 *   not be parsed. Its own row, costing that row's resolution and no figure: the record is
 *   still counted, here and in every other breakdown, exactly as `by_task` counts a record
 *   whose declaration could not be read.
 * - `reason` — the record belongs to no task at all, carrying the same
 *   `TaskUnattributedReason` `CostReportTaskRow` gives it; up to three such rows, one per
 *   reason actually present, never collapsed into one. */
export interface CostReportBacklogRow {
  readonly backlog?: string;
  readonly declaration?: "none" | "unreadable";
  readonly reason?: TaskUnattributedReason;
  readonly totals: CostTotals;
}

/** One orchestrated run's figures - keyed on the closed `FlowInterval` a record's own
 * moment falls inside, never on `flow` (the orchestrating skill's name) alone: a session
 * running the same orchestrating skill twice must stay two rows, not one row merged by
 * name (see `flow-attribution.ts`'s own doc on `buildFlowIntervals`). `startedAt` is the
 * flow's own opening moment, carried beside `flow` so two rows that do share a name are
 * still told apart - the same reason `CostReportStepRow` carries `attribution` beside
 * `step`.
 *
 * Absent on the one row for every record whose own moment falls in no flow interval at
 * all - a normal state, its own row, never folded into a named one and never split by a
 * reason the way `CostReportTaskRow`'s remainder is: nothing about *why* a record sits
 * outside every flow needs telling apart the way "no declaration" and "the journal falls
 * silent" do for a task, since a flow is read from the same sequence either way.
 *
 * **The limit stated where this figure is read:** a skill a person runs by hand while a
 * flow is open still counts inside it. The journal cannot tell a hand-run skill from one
 * the orchestrator itself invoked - both write the identical `step_start` line - so
 * neither can this breakdown. */
export interface CostReportFlowRow {
  readonly flow?: string;
  readonly startedAt?: string;
  readonly totals: CostTotals;
}

/** One person's figures — a mapped person, one unplaced identity, or the records that
 * carried none at all. `person` is the canonical `personId`, present only when `resolution`
 * is `"mapped"`; the raw identifier that produced an `"unresolved"` row lives in
 * `identities` instead, since that row was never claimed by anyone to have a canonical form.
 * `identities` always carries what produced the row — every raw identifier behind a mapped
 * person, including their own canonical one, or the single raw identifier behind an
 * unresolved row — so a report line naming a person is traceable back to its evidence
 * without a second lookup against the identity. */
export interface CostReportPersonRow {
  readonly resolution: PersonResolution;
  readonly person?: string;
  readonly displayName?: string;
  readonly identities: readonly string[];
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
  /** Straight from `buildFlowIntervals`, the same way `taskIntervals` comes from
   * `buildTaskIntervals` - built once per session, never re-derived per record. */
  readonly flowIntervals: readonly FlowInterval[];
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

/** Why this machine's own identity could not be used to resolve records against - the
 * two possible causes, named rather than folded into one boolean, so a program reading a
 * report can tell "the file exists but could not be read" apart from "nobody declared
 * one at all", exactly as a person reading the caveat can. */
export type PersonIdentityUnusableCause = "unreadable" | "absent";

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
  /** Every distinct task identity this period's records could fall inside, resolved once
   * each to its own folder's declaration - never read here, and never re-resolved per
   * record. Gathering this is `ReportCostUseCase`'s job, exactly like `journals` and
   * `identity`: the domain stays free of the filesystem `TaskBacklogReader` reads from.
   * Absent from a task this map cannot name reads as `{ kind: "none" }` - see
   * `backlogKeyOf`'s own doc for why a missing entry must never drop a record rather than
   * merely being unreachable through this input's one production caller. */
  readonly taskBacklogDeclarations?: ReadonlyMap<TaskIdentity, TaskBacklogDeclaration>;
  /** Where a generic filter's value has ever been seen - absent when the caller has none
   * to offer, which reads the same as a filter never matching it elsewhere. */
  readonly knownValues?: CostReportKnownValues;
  /** This machine's own identity, arriving as data rather than read from a module - the
   * domain stays free of where the identity file lives. Absent or `null` both mean no
   * identity was declared, which resolves every identifier as `unresolved` rather than
   * failing the report - the same reading `identityUnusableCause: "absent"` names below. */
  readonly identity?: PersonIdentity | null;
  /** Which of the two possible reasons the identity above could not be used to resolve
   * records - `"unreadable"` for a declared identity file that could not be read back,
   * `"absent"` for no identity declared at all. Either way costs the resolution alone:
   * every record is still counted, with every identifier reported as `unresolved` and
   * this cause saying why, the same way `unreadableLines` says why a total came from a
   * partial read. This field itself is absent only when the identity was read back fine. */
  readonly identityUnusableCause?: PersonIdentityUnusableCause;
  /** Whether the project switch is on right now, as data rather than a read this pure
   * function performs itself - the same reasoning `identity` above documents. Required,
   * not defaulted: `ReportCostUseCase` is this function's one production caller and always
   * has a concrete answer, since it is the one thing that reads the switch. A default here
   * would be reachable only from a test that never bothered to ask - which is exactly the
   * silent "on" this field exists to rule out. */
  readonly measurementEnabled: boolean;
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
  readonly byTasks: readonly CostReportTaskRow[];
  /** Every task's records regrouped by what its folder declares - see
   * `CostReportBacklogRow`. Sums to `totals` exactly like every other breakdown. */
  readonly byBacklog: readonly CostReportBacklogRow[];
  /** One row per orchestrated run the journal's own sequence names, plus the one row for
   * work that ran outside every flow - see `CostReportFlowRow`. Sums to `totals` exactly
   * like every other breakdown. */
  readonly byFlows: readonly CostReportFlowRow[];
  readonly byDays: readonly CostReportDayRow[];
  /** Mapped people first, then every unplaced identity, then the one row for records
   * carrying none at all - a reader sees people before gaps. Within the mapped and the
   * unresolved groups, largest first; never merged across the three. */
  readonly byPeople: readonly CostReportPersonRow[];
  readonly attributionMix: readonly CostReportAttributionRow[];
  /** Present only alongside `task`: an unfiltered period carries no per-record task identity
   * to break down (see metrics-contract.md's "Attributing records to a task"). */
  readonly taskAttributionMix?: readonly CostReportTaskAttributionRow[];
  readonly undatedRecords: number;
  readonly unreadableLines: number;
  /** Which cause made this machine's own identity unusable for resolving records - see
   * `CostReportInput`'s own field of the same name. Absent when the identity was read
   * back fine; distinguishing a resolved identity from an absent or unreadable one is
   * `byPeople`'s job, not this field's. */
  readonly identityUnusableCause?: PersonIdentityUnusableCause;
  /** Whether the project switch is on right now - never inferred from whether any record
   * was found, since an empty period and a switched-off one are different facts a reader
   * must not conflate. Always concrete here, unlike the optional input field it is resolved
   * from: every report has an answer to this, even the ones that default it. */
  readonly measurementEnabled: boolean;
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
    // Gated the same way every token counter is gated below, not on `!== undefined`: a
    // record read off disk is never guaranteed to hold the type its own field declares, and
    // `JSON.stringify(NaN)` is `null` - which is `!== undefined` and would have read as a
    // known, free cost rather than the unknown one this layer exists to keep distinct.
    if (typeof record.cost_usd === "number") {
      this.costMicroUsd = (this.costMicroUsd ?? 0) + toMicroUsd(record.cost_usd);
    }
    this.addTokensOnly(record);
  }

  /** Never touches `requests` or `cost_usd`: a `kind: "session"` local-read total is not a
   * billed request, and the tool never states a cost for one. */
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

/** Every token a row counted, across all four disjoint counters. The weight `bySize` falls
 * back to for a costless row - never `inputTokens + outputTokens` alone: every tool this
 * report has ever seen runs at 90%-plus cache, so a weight blind to the two cache counters
 * would order a costless breakdown by the sliver of its volume nobody reads it for, and
 * invert the order a reader actually wants. It is also the same sum `render.cjs`'s `tokensOf`
 * already prints beside a costless row, on both sides - weighing by anything else would sort
 * a row by a number the report never shows. */
function tokensOf(totals: CostTotals): number {
  return (
    (totals.inputTokens ?? 0) +
    (totals.outputTokens ?? 0) +
    (totals.cacheReadTokens ?? 0) +
    (totals.cacheCreationTokens ?? 0)
  );
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
    return totals.costMicroUsd ?? tokensOf(totals);
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

// An empty string is not a name - it is what a tool writes when it has none to give, the
// same reading `report.cjs`'s own `projectKeyOf` already gives it. Treating it as its own
// project would print a nameless row a person cannot act on, and would disagree with the
// plugin about where that record belongs. `typeof` guards a field only declared `string` by
// its type: a record read off disk carries whatever its own line actually held.
function projectKeyOf(record: TelemetrySinkRecord): ProjectKey {
  return typeof record.project_id === "string" && record.project_id !== ""
    ? record.project_id
    : NO_KNOWN_PROJECT;
}

// The same idea, one dimension over: a record with no model is its own group, never
// dropped. `bySteps` has `unattributed` and `byProjects` has the row above for exactly this
// reason - both the Codex and OpenCode readers permit a request record with no model, so
// without this row `byModels` would stop reconciling to its own total with nothing naming
// the gap. Deliberately narrower than `projectKeyOf`: nothing measured so far ever writes
// an empty-string `model`, so unlike `project_id` this stays an `undefined` check rather
// than also folding in `""` - a rule this module has no evidence for yet.
const NO_KNOWN_MODEL = Symbol("no known model");
type ModelKey = string | typeof NO_KNOWN_MODEL;

function modelKeyOf(record: TelemetrySinkRecord): ModelKey {
  return record.model === undefined ? NO_KNOWN_MODEL : record.model;
}

// The same idea, for the task a record's own moment fell inside - a record whose session
// never declared one, whose moment falls before a declaration, or whose moment the
// journal's own declared coverage has run out before, is its own group, keyed on *which* of
// those three this record is, never dropped and never collapsed into one bucket. A plain
// string, unlike `NO_KNOWN_PROJECT` and `NO_KNOWN_MODEL`: `TaskIdentity` is always
// `${month}/${name}`, which a reason string never is, so the two can never collide.
type TaskRowKey = TaskIdentity | TaskUnattributedReason;

// The same idea, one level above a task: a task whose folder declares no backlog item, or
// whose declaration exists but could not be read, is its own group - never folded into
// each other, and never folded into a named item. Symbols, the same reason `NO_KNOWN_PROJECT`
// and `NO_KNOWN_MODEL` are: a backlog item is a free-form string on either support (a forge
// reference or a project-relative path), so nothing here can rule out a real item colliding
// with a string sentinel the way a plain string could.
const NO_BACKLOG_DECLARED = Symbol("task declares no backlog item");
const UNREADABLE_BACKLOG_DECLARATION = Symbol("task's backlog declaration could not be read");
type BacklogRowKey =
  | string
  | typeof NO_BACKLOG_DECLARED
  | typeof UNREADABLE_BACKLOG_DECLARATION
  | TaskUnattributedReason;

/** Every session's own closed intervals, keyed by vendor id - built once from
 * `buildTaskIntervals`'s own output, never a second notion of when a task was running.
 * Unlike `declaredIntervalsForTask`, this keeps every task a session ever declared, not
 * only one: `byTasks` groups by whichever task a record's moment falls in, not by
 * membership in a single task asked for. */
function allTaskIntervalsByVendorId(
  journals: readonly CostReportSessionJournal[]
): ReadonlyMap<string, readonly TaskInterval[]> {
  const byVendorId = new Map<string, readonly TaskInterval[]>();
  for (const journal of journals) {
    if (journal.taskIntervals.length > 0) byVendorId.set(journal.vendorId, journal.taskIntervals);
  }
  return byVendorId;
}

/** Which task a record's own moment falls inside, among *all* of its session's declared
 * intervals - `taskUnattributedReason` for a record whose moment falls in none. Intervals
 * within one session are closed and never overlap (`buildTaskIntervals`), so at most one
 * ever matches - this never has to choose between two.
 *
 * `interval.path` failing to resolve here is unreachable for every interval this codebase's
 * own wiring ever produces, not merely untested: `buildTaskIntervals` already refuses to
 * emit a `TaskInterval` for a declared path `taskIdentityFromWrittenPath` cannot turn into
 * an identity (a literal `..` path segment, say). It is not unreachable in the type this
 * function actually takes - `CostReportSessionJournal.taskIntervals` is a plain input
 * field, so a caller (a test, most concretely) can still hand this a `TaskInterval` literal
 * whose `path` resolves to nothing, which is exactly why the fallback stays rather than
 * being deleted as dead code. Reading such a moment the same as no interval covering it at
 * all is deliberate, not an invented fourth reason: a path this layer cannot turn into an
 * identity names no task a person could act on by name either. */
function declaredTaskKeyOf(
  record: TelemetrySinkRecord,
  intervalsByVendorId: ReadonlyMap<string, readonly TaskInterval[]>
): TaskRowKey {
  const intervals = intervalsByVendorId.get(record.vendor_id) ?? [];
  const interval = intervals.find((candidate) =>
    momentFallsWithin([candidate], record.event_timestamp)
  );
  const identity = interval && taskIdentityFromWrittenPath(interval.path);
  return identity ?? taskUnattributedReason(intervals, record.event_timestamp);
}

/** Which `byBacklog` row a record's own task-row key belongs in - built from
 * `declaredTaskKeyOf`'s own output, never a second notion of which task a record fell
 * inside. A reason (the record belongs to no task at all) passes straight through
 * unchanged, exactly as `by_task` gives it; a named task looks up its folder's declaration
 * once, in the map `ReportCostUseCase` already resolved for every distinct task identity
 * this period's records could name.
 *
 * A named task missing from `declarations` is unreachable through this module's one
 * production caller - `report-cost-use-case.ts` resolves every task identity `byTasks` can
 * ever key on before this ever runs - but is read as `{ kind: "none" }` rather than
 * throwing or dropping the record, the same defensive default `declaredTaskKeyOf`'s own
 * `interval.path` fallback documents: a caller a test can still construct must never lose a
 * record's figures to a gap in wiring this module cannot see from here. */
function backlogKeyOf(
  taskRowKey: TaskRowKey,
  declarations: ReadonlyMap<TaskIdentity, TaskBacklogDeclaration> | undefined
): BacklogRowKey {
  if (isTaskUnattributedReason(taskRowKey)) return taskRowKey;
  const declaration = declarations?.get(taskRowKey) ?? { kind: "none" as const };
  if (declaration.kind === "none") return NO_BACKLOG_DECLARED;
  if (declaration.kind === "unreadable") return UNREADABLE_BACKLOG_DECLARATION;
  return declaration.link.backlog;
}

// A record falling in no flow interval at all is its own group, keyed on this symbol -
// never a plain string sentinel: a `FlowInterval` is never itself a valid key value here
// (see `FlowRowKey` below), so nothing about a real interval could ever collide with it,
// unlike `NO_BACKLOG_DECLARED`'s own worry about a free-form backlog string.
const OUTSIDE_EVERY_FLOW = Symbol("record falls outside every flow interval");

// Keyed on the closed `FlowInterval` object itself, by reference, never on `skill` alone:
// two orchestrated runs of the same skill in one session are two distinct `FlowInterval`
// objects (`buildFlowIntervals`'s own doc comment), and a `Map` keyed on object identity
// keeps them two rows without needing a synthesized composite string key. This also gives
// `byFlows` for free the property `phase-1.md` asks of it: a record outside every flow can
// never collide with one inside, since `OUTSIDE_EVERY_FLOW` is a symbol no interval object
// can ever equal.
type FlowRowKey = FlowInterval | typeof OUTSIDE_EVERY_FLOW;

/** Every session's own closed flow intervals, keyed by vendor id - the same shape
 * `allTaskIntervalsByVendorId` gives task intervals, one layer wider. */
function allFlowIntervalsByVendorId(
  journals: readonly CostReportSessionJournal[]
): ReadonlyMap<string, readonly FlowInterval[]> {
  const byVendorId = new Map<string, readonly FlowInterval[]>();
  for (const journal of journals) {
    if (journal.flowIntervals.length > 0) byVendorId.set(journal.vendorId, journal.flowIntervals);
  }
  return byVendorId;
}

/** Which flow interval a record's own moment falls inside, among all of its session's
 * orchestrated runs - `OUTSIDE_EVERY_FLOW` for a record whose moment falls in none, the
 * same "no reason taxonomy" spec's own hard constraint gives this axis: unlike a task's
 * three distinct gaps, nothing here needs telling apart *why* a record sits outside every
 * flow, since a flow is read from the same sequence either way. Intervals within one
 * session are closed and never overlap (`buildFlowIntervals`), so at most one ever
 * matches. */
function flowKeyOf(
  record: TelemetrySinkRecord,
  intervalsByVendorId: ReadonlyMap<string, readonly FlowInterval[]>
): FlowRowKey {
  const intervals = intervalsByVendorId.get(record.vendor_id) ?? [];
  const interval = intervals.find((candidate) =>
    momentFallsWithin([candidate], record.event_timestamp)
  );
  return interval ?? OUTSIDE_EVERY_FLOW;
}

// A record with no identifier is its own row, keyed on a symbol the same way
// `NO_KNOWN_PROJECT` keys the row for no known project - never folded into an unresolved
// row, which the spec's own three-way shape (`PersonResolution`) requires stay distinct.
const NO_KNOWN_PERSON = Symbol("no known person");
type PersonRowKey = string | typeof NO_KNOWN_PERSON;

// An empty string reads the same as absent, the same reading `projectKeyOf` already gives
// an empty `project_id` - a tool writing `person_id: ""` has stated nothing, not named an
// identity nobody could ever claim.
function personRawIdOf(record: TelemetrySinkRecord): string | undefined {
  return typeof record.person_id === "string" && record.person_id !== ""
    ? record.person_id
    : undefined;
}

/** One resolved person's group - keyed once, on whichever field makes two records the same
 * row: a mapped record's canonical `personId`, so two raw identities one person declared
 * merge; an unresolved record's own raw identifier, so two unplaced identities never merge
 * into each other; or the shared `NO_KNOWN_PERSON` symbol for a record with none. */
interface PersonGroup {
  readonly resolved: ResolvedPerson;
  readonly totals: TotalsAccumulator;
}

function personGroupKey(resolved: ResolvedPerson): PersonRowKey {
  if (resolved.resolution === "mapped" && resolved.personId !== undefined) {
    return resolved.personId;
  }
  if (resolved.resolution === "unresolved") {
    const [rawId] = resolved.identities;
    if (rawId !== undefined) return rawId;
  }
  return NO_KNOWN_PERSON;
}

function addToPersonGroup(
  groups: Map<PersonRowKey, PersonGroup>,
  record: TelemetrySinkRecord,
  resolved: ResolvedPerson
): void {
  const key = personGroupKey(resolved);
  const existing = groups.get(key);
  if (existing) {
    existing.totals.add(record);
    return;
  }
  const created: PersonGroup = { resolved, totals: new TotalsAccumulator() };
  created.totals.add(record);
  groups.set(key, created);
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
  readonly models: Map<ModelKey, TotalsAccumulator>;
  readonly tools: Map<AiToolId, TotalsAccumulator>;
  readonly toolSessionTotals: Map<AiToolId, TotalsAccumulator>;
  readonly attributions: Map<StepAttributionSource, TotalsAccumulator>;
  readonly taskAttributions: Map<TaskAttributionSource, TotalsAccumulator>;
  readonly projects: Map<ProjectKey, TotalsAccumulator>;
  readonly tasks: Map<TaskRowKey, TotalsAccumulator>;
  readonly backlog: Map<BacklogRowKey, TotalsAccumulator>;
  readonly flows: Map<FlowRowKey, TotalsAccumulator>;
  readonly people: Map<PersonRowKey, PersonGroup>;
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
    tasks: new Map(),
    backlog: new Map(),
    flows: new Map(),
    people: new Map(),
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
// way except a one-shot, already-complete total (see Copilot), so it is never at risk
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
  membership: TaskMembership | null,
  taskIntervalsByVendorId: ReadonlyMap<string, readonly TaskInterval[]>,
  flowIntervalsByVendorId: ReadonlyMap<string, readonly FlowInterval[]>,
  identity: PersonIdentity | null,
  taskBacklogDeclarations: ReadonlyMap<TaskIdentity, TaskBacklogDeclaration> | undefined
): void {
  groups.totals.add(record);
  addToStepGroup(groups.steps, record);
  accumulateInto(groups.attributions, record.step_attribution, record);
  accumulateInto(groups.tools, record.tool, record);
  accumulateInto(groups.models, modelKeyOf(record), record);
  accumulateInto(groups.projects, projectKeyOf(record), record);
  const taskRowKey = declaredTaskKeyOf(record, taskIntervalsByVendorId);
  accumulateInto(groups.tasks, taskRowKey, record);
  accumulateInto(groups.backlog, backlogKeyOf(taskRowKey, taskBacklogDeclarations), record);
  accumulateInto(groups.flows, flowKeyOf(record, flowIntervalsByVendorId), record);
  addToPersonGroup(groups.people, record, resolvePerson(identity, personRawIdOf(record)));
  const day = telemetrySinkRecordDayKey(record);
  if (day !== undefined && groups.days.has(day)) groups.days.get(day)?.add(record);
  const attribution = membership === null ? undefined : taskAttributionOf(record, membership);
  if (attribution !== undefined) accumulateInto(groups.taskAttributions, attribution, record);
}

function accumulate(
  records: readonly TelemetrySinkRecord[],
  fromDay: string,
  toDay: string,
  membership: TaskMembership | null,
  journals: readonly CostReportSessionJournal[],
  identity: PersonIdentity | null,
  taskBacklogDeclarations: ReadonlyMap<TaskIdentity, TaskBacklogDeclaration> | undefined
): Groups {
  const groups = emptyGroups(fromDay, toDay);
  const taskIntervalsByVendorId = allTaskIntervalsByVendorId(journals);
  const flowIntervalsByVendorId = allFlowIntervalsByVendorId(journals);
  for (const record of records) {
    if (record.kind === "session") {
      accumulateSessionRecord(groups, record);
      continue;
    }
    accumulateRequestRecord(
      groups,
      record,
      membership,
      taskIntervalsByVendorId,
      flowIntervalsByVendorId,
      identity,
      taskBacklogDeclarations
    );
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

// Typed over `string | symbol`, wider than either `TaskRowKey` or `BacklogRowKey` alone,
// so `taskRows` and `backlogRows` share one check rather than each carrying its own copy -
// safe because every reason is a plain string and a symbol key never equals one.
function isTaskUnattributedReason(key: string | symbol): key is TaskUnattributedReason {
  return typeof key === "string" && (TASK_UNATTRIBUTED_REASONS as readonly string[]).includes(key);
}

/** Every task a record's own moment fell inside, largest first, then one row per reason
 * actually present for what fell in none - `TASK_UNATTRIBUTED_REASONS`' own fixed order,
 * always after every named task regardless of size, the same convention `personRows` gives
 * its own `none` row. Up to three such rows, never fewer than the reasons present: two
 * different gaps collapsed into one row is the fault this breakdown exists to avoid. */
function taskRows(tasks: ReadonlyMap<TaskRowKey, TotalsAccumulator>): readonly CostReportTaskRow[] {
  const named: CostReportTaskRow[] = [];
  const byReason = new Map<TaskUnattributedReason, CostReportTaskRow>();
  for (const [key, accumulator] of tasks) {
    if (isTaskUnattributedReason(key)) {
      byReason.set(key, { reason: key, totals: accumulator.build() });
      continue;
    }
    named.push({ task: key, attribution: "declared", totals: accumulator.build() });
  }
  const sorted = bySize(
    named,
    (row) => row.totals,
    (row) => row.task ?? ""
  );
  const reasonRows = TASK_UNATTRIBUTED_REASONS.map((reason) => byReason.get(reason)).filter(
    (row): row is CostReportTaskRow => row !== undefined
  );
  return [...sorted, ...reasonRows];
}

/** Every backlog item a task declared, largest first, then the two rows for a known task
 * that named none or could not be read, then one row per reason a record fell in no task at
 * all - `TASK_UNATTRIBUTED_REASONS`' own fixed order, the same tail convention `taskRows`
 * uses. Two tasks declaring the same item merge here by construction: `backlogKeyOf` keys
 * both on the identical `backlog` string, so `accumulateInto` folds them into one
 * accumulator before this ever runs - never a second merge step that could disagree with
 * how every other axis already reconciles. */
interface BacklogGroups {
  readonly named: readonly CostReportBacklogRow[];
  readonly byReason: ReadonlyMap<TaskUnattributedReason, CostReportBacklogRow>;
  readonly none: CostReportBacklogRow | undefined;
  readonly unreadable: CostReportBacklogRow | undefined;
}

// Split from `backlogRows` purely to stay under this codebase's own line-per-function limit
// - one pass classifying every key into the four shapes a row can be, nothing sorted yet.
function classifyBacklogGroups(
  backlog: ReadonlyMap<BacklogRowKey, TotalsAccumulator>
): BacklogGroups {
  const named: CostReportBacklogRow[] = [];
  const byReason = new Map<TaskUnattributedReason, CostReportBacklogRow>();
  let none: CostReportBacklogRow | undefined;
  let unreadable: CostReportBacklogRow | undefined;
  for (const [key, accumulator] of backlog) {
    if (isTaskUnattributedReason(key)) {
      byReason.set(key, { reason: key, totals: accumulator.build() });
    } else if (key === NO_BACKLOG_DECLARED) {
      none = { declaration: "none", totals: accumulator.build() };
    } else if (key === UNREADABLE_BACKLOG_DECLARATION) {
      unreadable = { declaration: "unreadable", totals: accumulator.build() };
    } else {
      named.push({ backlog: key, totals: accumulator.build() });
    }
  }
  return { named, byReason, none, unreadable };
}

function backlogRows(
  backlog: ReadonlyMap<BacklogRowKey, TotalsAccumulator>
): readonly CostReportBacklogRow[] {
  const { named, byReason, none, unreadable } = classifyBacklogGroups(backlog);
  const sorted = bySize(
    named,
    (row) => row.totals,
    (row) => row.backlog ?? ""
  );
  const reasonRows = TASK_UNATTRIBUTED_REASONS.map((reason) => byReason.get(reason)).filter(
    (row): row is CostReportBacklogRow => row !== undefined
  );
  return [...sorted, ...(none ? [none] : []), ...(unreadable ? [unreadable] : []), ...reasonRows];
}

// Second precision, no milliseconds - the same spelling `record.cjs`'s own `nowIso` writes
// to the journal's `at` field. `startMs` here always comes from `Date.parse`-ing one such
// value, so its own milliseconds are already zero; this only strips the ".000" `toISOString`
// would otherwise append, so a row's `startedAt` string-matches the journal line it opened
// on rather than looking like a different moment.
function isoSecondsFromMs(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/u, "Z");
}

/** Every orchestrated run the period's journals name, largest first, then the one row for
 * work that fell in no flow interval at all - see `CostReportFlowRow`. No reason taxonomy
 * the way `by_task`'s and `by_backlog`'s own remainders carry one: a flow is read from the
 * same sequence either way, so there is only one fact to state about falling outside every
 * one of them, never three.
 *
 * The remainder is pinned last rather than sorted with the named rows, the same tail
 * convention `taskRows` and `backlogRows` already keep. Sorting it by size put it first
 * whenever work outside every flow outweighed each single run - which is the ordinary case,
 * not a corner one - so the axis led with its own remainder while the two axes beside it
 * led with their largest named row. One breakdown that orders itself differently from its
 * neighbours is read as a different kind of answer, and it is not one. */
function flowRows(flows: ReadonlyMap<FlowRowKey, TotalsAccumulator>): readonly CostReportFlowRow[] {
  const named: CostReportFlowRow[] = [];
  let outsideEveryFlow: CostReportFlowRow | undefined;
  for (const [key, accumulator] of flows) {
    if (key === OUTSIDE_EVERY_FLOW) {
      outsideEveryFlow = { totals: accumulator.build() };
      continue;
    }
    named.push({
      flow: key.skill,
      startedAt: isoSecondsFromMs(key.startMs),
      totals: accumulator.build(),
    });
  }
  const sorted = bySize(
    named,
    (row) => row.totals,
    (row) => `${row.flow ?? ""}@${row.startedAt ?? ""}`
  );
  return outsideEveryFlow === undefined ? sorted : [...sorted, outsideEveryFlow];
}

/** Every day in the period, in order — never sorted by size, unlike every other breakdown
 * here. A series read out of order is not a series. */
function dayRows(days: ReadonlyMap<string, TotalsAccumulator>): readonly CostReportDayRow[] {
  return [...days].map(([day, accumulator]) => ({ day, totals: accumulator.build() }));
}

/** Every model a record named, largest first, plus one row for what named none. */
function modelRows(
  models: ReadonlyMap<ModelKey, TotalsAccumulator>
): readonly CostReportModelRow[] {
  const rows: CostReportModelRow[] = [...models].map(([key, accumulator]) => ({
    ...(key === NO_KNOWN_MODEL ? {} : { model: key }),
    totals: accumulator.build(),
  }));
  return bySize(
    rows,
    (row) => row.totals,
    (row) => row.model ?? ""
  );
}

function personRowOf(group: PersonGroup): CostReportPersonRow {
  const { resolved } = group;
  return {
    resolution: resolved.resolution,
    ...(resolved.personId === undefined ? {} : { person: resolved.personId }),
    ...(resolved.displayName === undefined ? {} : { displayName: resolved.displayName }),
    identities: resolved.identities,
    totals: group.totals.build(),
  };
}

/** Mapped people first, then every unplaced identity, then the one no-identifier row last -
 * `bySize` alone cannot give this order, since it sorts purely on weight and a large
 * unresolved row would otherwise outrank a small mapped one. Largest first within the
 * mapped group and within the unresolved group; the no-identifier row is never sorted
 * against either, since there is at most one. */
function personRows(
  people: ReadonlyMap<PersonRowKey, PersonGroup>
): readonly CostReportPersonRow[] {
  const rows = [...people.values()].map(personRowOf);
  const keyOf = (row: CostReportPersonRow) => row.person ?? row.identities[0] ?? "";
  const mapped = bySize(
    rows.filter((row) => row.resolution === "mapped"),
    (row) => row.totals,
    keyOf
  );
  const unresolved = bySize(
    rows.filter((row) => row.resolution === "unresolved"),
    (row) => row.totals,
    keyOf
  );
  const none = rows.filter((row) => row.resolution === "none");
  return [...mapped, ...unresolved, ...none];
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

/** `undatedRecords`, `unreadableLines` and `identityUnusableCause` together - what the
 * read could not do, pulled out on its own for the same reason `selectionFields` is: the
 * object literal below reads as one shape, not a wall of field-by-field assignments. */
function readFields(
  input: CostReportInput
): Pick<
  CostReport,
  "undatedRecords" | "unreadableLines" | "identityUnusableCause" | "measurementEnabled"
> {
  return {
    undatedRecords: input.undatedRecords,
    unreadableLines: input.unreadableLines,
    measurementEnabled: input.measurementEnabled,
    ...(input.identityUnusableCause === undefined
      ? {}
      : { identityUnusableCause: input.identityUnusableCause }),
  };
}

/** Every `by*` breakdown together - pulled out on its own for the same reason
 * `selectionFields` and `readFields` are: the object literal below reads as one shape,
 * not a wall of field-by-field assignments. */
function breakdownFields(
  input: CostReportInput,
  groups: Groups
): Pick<
  CostReport,
  | "bySteps"
  | "byModels"
  | "byTools"
  | "byProjects"
  | "byTasks"
  | "byBacklog"
  | "byFlows"
  | "byDays"
  | "byPeople"
> {
  return {
    bySteps: stepRows(groups.steps),
    byModels: modelRows(groups.models),
    byTools: toolRowsInScope(input, groups),
    byProjects: projectRows(groups.projects),
    byTasks: taskRows(groups.tasks),
    byBacklog: backlogRows(groups.backlog),
    byFlows: flowRows(groups.flows),
    byDays: dayRows(groups.days),
    byPeople: personRows(groups.people),
  };
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
    ...breakdownFields(input, groups),
    attributionMix: attributionRows(groups.attributions),
    ...(membership === null
      ? {}
      : { taskAttributionMix: taskAttributionRows(groups.taskAttributions) }),
    ...readFields(input),
  };
}

/** A group key only for a `kind: "request"`, `provenance: "local-read"` record carrying a
 * `turn_id` — the shape a local re-read of a still-running turn produces more than one of
 * (see `read-local-cost-use-case.ts`'s `storeNewCandidates`, and metrics-contract.md's "The
 * other way to double count"). Restricted to `kind: "request"`: a `kind: "session"` record
 * can carry a `turn_id` too — Copilot's shutdown total is keyed on the shutdown event's own
 * id — but it is a one-shot cumulative figure with no provisional reading to collapse,
 * grouping it here would treat a whole-session total as one more corrigible turn.
 * Restricted to `provenance: "local-read"`: on the export route the same field is a prompt
 * id several billed calls share (see `billedRequestKey` below), so the identical key there
 * would merge distinct calls instead of two readings of one. */
function localReadTurnKey(record: TelemetrySinkRecord): string | null {
  if (record.kind !== "request" || record.provenance !== "local-read") return null;
  return record.turn_id === undefined
    ? null
    : `${record.tool} ${record.vendor_id} ${record.turn_id}`;
}

/** How much of a group a record accounts for, used only to pick the largest of several
 * readings of the same still-growing turn — never stored, never itself summed into a
 * total. */
function counterWeight(record: TelemetrySinkRecord): number {
  return COUNTER_FIELDS.reduce((sum, field) => {
    const value = record[COUNTER_SOURCE[field]];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

/** How many of the four counters a record states at all, whether zero or not — the
 * tie-break `mergeSupersededTurnGroup` needs beyond `counterWeight` alone, since an
 * *observed* zero (Codex sometimes reports `cache_write_input_tokens: 0` once a later
 * event states it) and a counter never mentioned both add zero to the weight, and only
 * this distinguishes them. Preferring the record that states more never risks preferring a
 * shrink: `strictlyImprovesOn`'s write-time guard already refused any candidate that would
 * have dropped a counter the stored one had, so within one group nothing here ever loses
 * a counter a heavier-weighted sibling also states. */
function definedCounterCount(record: TelemetrySinkRecord): number {
  return COUNTER_FIELDS.reduce(
    (count, field) => count + (typeof record[COUNTER_SOURCE[field]] === "number" ? 1 : 0),
    0
  );
}

/**
 * One Codex-shaped turn, read more than once while it was still open, collapsed to the one
 * record carrying the most complete counters. Never done at write time: the sink is
 * append-only, so an earlier, partial reading of a turn is never edited in place — only
 * reconciled by whatever reads it back, which is here, the same way `mergeBilledRequestGroup`
 * reconciles two routes seeing one call.
 *
 * Unlike that merge, every record in this group came from the *same* route reading the
 * *same* file at different moments, so the survivor is simply whichever carries the largest
 * counters — never a blend of two, which would state a combination of token counts the
 * tool's own file never actually reported together. A later record that reads smaller than
 * an earlier one (a shrink, not a correction) is never picked over the larger one this way,
 * whatever order the two arrived in. */
function mergeSupersededTurnGroup(group: readonly TelemetrySinkRecord[]): TelemetrySinkRecord {
  if (group.length === 1) return group[0];
  const heaviest = Math.max(...group.map(counterWeight));
  const largest = group.filter((record) => counterWeight(record) === heaviest);
  const mostDefined = Math.max(...largest.map(definedCounterCount));
  return pickDeterministically(
    largest.filter((record) => definedCounterCount(record) === mostDefined)
  );
}

/** Every other kind and route passes through untouched — see `localReadTurnKey`. */
function collapseSupersededTurns(
  records: readonly TelemetrySinkRecord[]
): readonly TelemetrySinkRecord[] {
  const groups = new Map<string, TelemetrySinkRecord[]>();
  const rest: TelemetrySinkRecord[] = [];
  for (const record of records) {
    const key = localReadTurnKey(record);
    if (key === null) {
      rest.push(record);
      continue;
    }
    const bucket = groups.get(key);
    if (bucket) bucket.push(record);
    else groups.set(key, [record]);
  }
  return [...rest, ...[...groups.values()].map(mergeSupersededTurnGroup)];
}

/** A group key only where `billed_request_id` is present — the one field measured so far
 * to be a stable, cross-route identifier for a single billed call (unlike `turn_id`, which
 * a main-agent request and its subagent share). A record with none joins nothing and is
 * left exactly as it arrived, the same rule an unmatched `turn_id` already follows for a
 * local re-read. */
function billedRequestKey(record: TelemetrySinkRecord): string | null {
  return record.billed_request_id === undefined
    ? null
    : `${record.tool}\u0000${record.vendor_id}\u0000${record.billed_request_id}`;
}

/** The same group, from any starting order, always answers the same record — the same
 * property `accumulate` already guarantees for the records it is handed (see "the same
 * records, however they arrive" below). A group's own order is never guaranteed: OTLP
 * redelivery can duplicate an export record, and a re-read joins a session's already-stored
 * records in whatever order the day files listed them, not the order they were billed in.
 * Picking `group[0]` would make the survivor depend on that accident; sorting on each
 * candidate's own serialized content does not. */
function pickDeterministically(candidates: readonly TelemetrySinkRecord[]): TelemetrySinkRecord {
  return [...candidates].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))[0];
}

/** Borrows `step_attribution`/`step`/`step_plugin` from a sibling that resolved one, when
 * `base`'s own is `"unattributed"` — the export route never states a step at all, so
 * leaving it as the survivor by default would throw away the one thing the local-read
 * route in the same group did know, preferring a tool-stated step over a journal-interval
 * one where both exist. */
function withStepBackfill(
  base: TelemetrySinkRecord,
  group: readonly TelemetrySinkRecord[]
): TelemetrySinkRecord {
  if (base.step_attribution !== "unattributed") return base;
  const stepDonors = group.filter(
    (record) => record !== base && record.step_attribution !== "unattributed"
  );
  if (stepDonors.length === 0) return base;
  const toolStated = stepDonors.filter((record) => record.step_attribution === "tool-stated");
  const donor = pickDeterministically(toolStated.length > 0 ? toolStated : stepDonors);
  return {
    ...base,
    step_attribution: donor.step_attribution,
    step: donor.step,
    step_plugin: donor.step_plugin,
  };
}

/** `person_id` and `person_display_name`, backfilled onto `base` from the group as a pair —
 * never one field from each — the day a person-scoped view was added, discharging the note
 * this function's own doc comment used to carry: "nothing in `CostReport` groups or filters
 * on person, so a survivor without them loses no figure this report shows. Revisit this the
 * day a person-scoped view is added." That day is `byPeople`. A local-read record and its
 * export-route sibling can share one `billed_request_id` (Claude Code's own `requestId`,
 * stated by both routes — see `telemetry-sink-record.ts`), and only the local-read side
 * ever carries a person; leaving the survivor without it whenever `pickDeterministically`
 * happened to keep the export side would silently report a mapped person's own work as
 * `"none"`, the exact false reading this feature exists to refuse. Independent of
 * `withStepBackfill`, never chained after it: that helper returns early the moment a step
 * is already resolved, and person still has to be checked even then. */
function withPersonBackfill(
  base: TelemetrySinkRecord,
  group: readonly TelemetrySinkRecord[]
): TelemetrySinkRecord {
  if (base.person_id !== undefined) return base;
  const donors = group.filter((record) => record.person_id !== undefined);
  if (donors.length === 0) return base;
  const donor = pickDeterministically(donors);
  return {
    ...base,
    person_id: donor.person_id,
    ...(donor.person_display_name === undefined
      ? {}
      : { person_display_name: donor.person_display_name }),
  };
}

/** One billed call, seen once by each of two live routes, collapsed to the one record a
 * report may safely sum. Never done at write time: the sink is append-only (see
 * metrics-contract.md, "Where records live"), so a record already stored can never be
 * corrected in place — only reconciled by whatever reads it back, which is here.
 *
 * The survivor keeps whichever record carries `cost_usd` — on every tool measured so far,
 * that is also the one whose four token counters are complete for the call
 * (metrics-contract.md, "Cost and token counters"), so nothing about the group's money is
 * ever summed from more than one record. `withStepBackfill` and `withPersonBackfill` then
 * each independently fill in what the survivor itself lacks from a sibling that has it. */
function mergeBilledRequestGroup(group: readonly TelemetrySinkRecord[]): TelemetrySinkRecord {
  if (group.length === 1) return group[0];
  const costBearing = group.filter((record) => record.cost_usd !== undefined);
  const base = pickDeterministically(costBearing.length > 0 ? costBearing : group);
  return withPersonBackfill(withStepBackfill(base, group), group);
}

/** `kind: "session"` records are never part of a billed-call group — no metric datapoint
 * measured so far carries `billed_request_id` at all — so this only ever touches
 * `kind: "request"` records, and only ones that carry the field. */
function collapseBilledRequests(
  records: readonly TelemetrySinkRecord[]
): readonly TelemetrySinkRecord[] {
  const groups = new Map<string, TelemetrySinkRecord[]>();
  const rest: TelemetrySinkRecord[] = [];
  for (const record of records) {
    const key = record.kind === "request" ? billedRequestKey(record) : null;
    if (key === null) {
      rest.push(record);
      continue;
    }
    const bucket = groups.get(key);
    if (bucket) bucket.push(record);
    else groups.set(key, [record]);
  }
  return [...rest, ...[...groups.values()].map(mergeBilledRequestGroup)];
}

export function buildCostReport(input: CostReportInput): CostReport {
  // Turn-supersede first, billed-request-collapse second: the first reconciles two readings
  // of one local-read record before the second ever has to reconcile two routes seeing one
  // call, so a still-open Codex turn is already down to one record by the time a billed-call
  // group is formed. Order between them is otherwise inert — the two key on disjoint fields.
  const records = collapseBilledRequests(collapseSupersededTurns(input.records));
  const membership = input.task === undefined ? null : taskMembership(input.journals, input.task);
  const stages = selectionStages(records, input, membership);
  const emptySelection = emptySelectionOf(stages, input, membership);
  const inScope = stages[stages.length - 1]?.records ?? [];
  const identity = input.identity ?? null;
  const groups = accumulate(
    inScope,
    input.fromDay,
    input.toDay,
    membership,
    input.journals,
    identity,
    input.taskBacklogDeclarations
  );

  return assembleCostReport(input, inScope, groups, membership, emptySelection);
}

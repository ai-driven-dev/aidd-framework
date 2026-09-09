/** An axis owns its key, sentinels, group shape and order under `report/axes/`; this file
 * owns the accumulators and the single pass that fills them. The edge back from `report/**`
 * is `import type` only - a value import there recreates the cycle this split avoids. */

import type { TelemetryRouteSupply } from "../../../kernel/measurement.js";
import type { AiToolId } from "../../../kernel/tool.js";
import type { FlowAttributionSource, FlowInterval } from "./flow-attribution.js";
import { type PersonResolution, type ResolvedPerson, resolvePerson } from "./person-resolution.js";
import type { PersonIdentity } from "./ports/person-identity-reader.js";
import { addToDayGroup, dayRange, dayRows } from "./report/axes/day-rows.js";
import {
  allFlowIntervalsByVendorId,
  type FlowRowKey,
  flowKeyOf,
  flowRows,
} from "./report/axes/flow-rows.js";
import {
  type PersonGroup,
  type PersonRowKey,
  personGroupKey,
  personRawIdOf,
  personRows,
} from "./report/axes/person-rows.js";
import {
  type AgentKey,
  agentKeyOf,
  agentNamingTools,
  agentRows,
  type ModelKey,
  modelKeyOf,
  modelRows,
  type ProjectKey,
  type PromptGroup,
  type PromptKey,
  projectKeyOf,
  projectRows,
  promptKeyOf,
  promptRows,
} from "./report/axes/record-stated-rows.js";
import { attributionRows, type StepGroup, stepRowKey, stepRows } from "./report/axes/step-rows.js";
import {
  allTaskIntervalsByVendorId,
  type BacklogRowKey,
  backlogKeyOf,
  backlogRows,
  type TaskGroup,
  type TaskRow,
  taskAttributionRows,
  taskRowKeyOf,
  taskRowOf,
  taskRows,
} from "./report/axes/task-rows.js";
import { buildToolRows, declaredToolsInScope } from "./report/axes/tool-rows.js";
import { COUNTER_FIELDS, COUNTER_SOURCE, type CounterField } from "./report/record-counters.js";
import { collapseBilledRequests, collapseSupersededTurns } from "./report/record-reconciliation.js";
import {
  activeFilters,
  emptySelectionOf,
  selectionStages,
  type TaskMembership,
  taskAttributionOf,
  taskMembership,
} from "./report/report-selection.js";
import type { StepAttributionSource } from "./step-attribution.js";
import type {
  TaskAttributionSource,
  TaskInterval,
  TaskUnattributedReason,
} from "./task-attribution.js";
import type { TaskBacklogDeclaration } from "./task-backlog-link.js";
import type { TaskIdentity } from "./task-identity.js";
import type { TelemetrySinkRecord } from "./telemetry-sink-record.js";

/** Money is carried as whole micro-dollars, never as the floating amount a record stores:
 * the same amounts summed in two groupings differ in the last bits, so no report over
 * floats reconciles exactly. Rounding once, on the way in, makes every sum after it exact. */
const MICRO_USD_PER_USD = 1e6;

export function toMicroUsd(costUsd: number): number {
  return Math.round(costUsd * MICRO_USD_PER_USD);
}

export function fromMicroUsd(microUsd: number): number {
  return microUsd / MICRO_USD_PER_USD;
}

/** Every counter is optional and an absent one means *never observed*, a different fact
 * from zero: a tool whose files carry no amount has an unknown cost, not a free one.
 * `requests` alone is never absent - a group exists because records are in it. */
export interface CostTotals {
  readonly requests: number;
  readonly costMicroUsd?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheCreationTokens?: number;
}

/** Keyed by the step *and* the strength of its attribution, never the step alone: the same
 * skill reached from the tool's own statement and from a journal interval is two claims, and
 * merging them presents an inference as a measurement. `step` is absent exactly when
 * `attribution` is `"unattributed"`, which names what nothing could say. */
export interface CostReportStepRow {
  readonly step?: string;
  readonly attribution: StepAttributionSource;
  readonly totals: CostTotals;
}

/** Largest first, plus one row for what named none - `model` absent there. Codex and
 * OpenCode both permit a request record with no model, so that row is what keeps `byModels`
 * reconciling to the total. */
export interface CostReportModelRow {
  readonly model?: string;
  readonly totals: CostTotals;
}

/** `main-thread` is a measurement - the tool names agents and said this record belongs to
 * none of them; `not-stated` is a tool whose route never names an agent at all, where
 * reading a main thread would assert a fact nothing observed. */
export type AgentAttributionSource = "tool-stated" | "main-thread" | "not-stated";

/** One agent's own share of a period, `agent` absent unless `attribution` is `tool-stated`.
 * The limit it lives with: a subagent line carrying no agent name reads as the main thread,
 * since nothing on the stored record separates the two, and no record already stored could
 * gain the field that would (see `storeNewCandidates`). */
export interface CostReportAgentRow {
  readonly agent?: string;
  readonly attribution: AgentAttributionSource;
  readonly totals: CostTotals;
}

/** `prompt` absent on the row for records that named none, and a record stored without one
 * stays unnamed however often the sink is re-read, since `storeNewCandidates` fixes a
 * record's field set the first time it sees the turn. Only a named prompt gets `startedAt`:
 * the unnamed row is drawn from many turns, and was never one unit with a start. */
export interface CostReportPromptRow {
  readonly prompt?: string;
  readonly startedAt?: string;
  readonly totals: CostTotals;
}

/** `covered` with no records is a tool that could have been read and did nothing this
 * period; `not-covered` is a tool nothing here can read at all. A consumer prints the second
 * as its reason, never as a zero. */
export type CostReportToolCoverage = "covered" | "not-covered";

/** Travels beside the figures so a consumer branches on a declared capability rather than
 * on whether a number happened to be present - the inference that turns a limit into a zero.
 * `null` means the route is not declared at all, not a declared route supplying nothing. */
export interface CostReportToolCapability {
  readonly localRead: TelemetryRouteSupply | null;
  readonly export: TelemetryRouteSupply | null;
  /** False means two things at once: no step can be derived from an interval, and a read
   * sweeping the journal never reaches one of this tool's sessions - so a perfectly readable
   * tool can report nothing, a limit otherwise indistinguishable from doing no work. */
  readonly journalAttributable: boolean;
  readonly taskAttributable: boolean;
}

export interface CostReportToolDeclaration {
  readonly tool: AiToolId;
  readonly coverage: CostReportToolCoverage;
  /** Why it is not covered, or what a covered tool's figures cannot be used for. Comes from
   * the tool's own declaration; this module never writes one. */
  readonly reason?: string;
  readonly capability: CostReportToolCapability;
}

export interface CostReportToolRow {
  readonly tool: AiToolId;
  readonly coverage: CostReportToolCoverage;
  readonly reason?: string;
  readonly capability: CostReportToolCapability;
  readonly totals: CostTotals;
  /** A local-read `kind: "session"` total, present only for a tool whose own file yields an
   * already-complete session figure rather than per-request records - today, only Copilot.
   * Never folded into `totals`: the two-kinds rule forbids treating one as the other. */
  readonly sessionTotals?: CostTotals;
}

/** How much of the broken-down total each strength accounts for - four figures that sum to
 * the total rather than a sentence saying attribution is approximate, since only the four
 * can be asserted. */
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

/** Largest first, plus one row for what named none - `project` absent there. Never folded
 * into a neighbour: that would place a figure that was never placed. */
export interface CostReportProjectRow {
  readonly project?: string;
  readonly totals: CostTotals;
}

/** Keyed on the declared interval a record's own moment falls in - never on the whole-session
 * written-path inference the `--task` filter reads, which would let one session's records
 * land in more than one row. A record in no declared interval carries `reason` instead, one
 * row per `TASK_UNATTRIBUTED_REASONS` entry present: two different gaps are not one gap. */
export interface CostReportTaskRow {
  readonly task?: TaskIdentity;
  readonly attribution?: TaskAttributionSource;
  readonly reason?: TaskUnattributedReason;
  readonly totals: CostTotals;
}

/** Grouped one level above `CostReportTaskRow`, on the same per-record task membership
 * `byTasks` computes. Where `backlog` is absent, exactly one of `declaration` (the task
 * declares no item, or its declaration could not be parsed - counted either way) and
 * `reason` (the record belongs to no task) says why: never both, never neither. */
export interface CostReportBacklogRow {
  readonly backlog?: string;
  readonly declaration?: "none" | "unreadable";
  readonly reason?: TaskUnattributedReason;
  readonly totals: CostTotals;
}

/** Keyed on the closed `FlowInterval` a record's moment falls inside, never on `flow` (the
 * orchestrating skill's name) alone: one session running that skill twice must stay two
 * rows, told apart by `startedAt`. The limit it lives with: a skill run by hand while a flow
 * is open still counts inside it, since the journal writes the same `step_start` for both. */
export interface CostReportFlowRow {
  readonly flow?: string;
  readonly attribution: FlowAttributionSource;
  readonly startedAt?: string;
  readonly totals: CostTotals;
}

/** `person` is the canonical `personId`, present only when `resolution` is `"mapped"`; an
 * `"unresolved"` row's raw identifier lives in `identities` instead, nobody having claimed a
 * canonical form for it. `identities` always carries what produced the row, so a line naming
 * a person is traceable back to its evidence without a second lookup. */
export interface CostReportPersonRow {
  readonly resolution: PersonResolution;
  readonly person?: string;
  readonly displayName?: string;
  readonly identities: readonly string[];
  readonly totals: CostTotals;
}

/** Every day the period spans in order, whether or not a record landed on it. A day with
 * nothing is a row of zeros - the one place here a zero is the measurement, because an
 * omitted row would read as continuity a gap is not. */
export interface CostReportDayRow {
  readonly day: string;
  readonly totals: CostTotals;
}

/** One session's journal, reduced to what a report needs. Assembling it is the caller's
 * job; this module never opens a file, and `taskIntervals` arrives already built once per
 * session rather than re-derived per record. */
export interface CostReportSessionJournal {
  readonly vendorId: string;
  readonly tool: string;
  readonly projectId?: string;
  readonly writtenPaths: readonly string[];
  readonly taskIntervals: readonly TaskInterval[];
  readonly flowIntervals: readonly FlowInterval[];
  /** The first and last moment this journal's own lines witnessed - the bound the
   * written-file route infers inside and never outside, since a journal lost and recreated
   * mid-session witnesses far less time than its session produced records for. Absent when
   * no line carried a moment this reader could parse: nothing witnessed, nothing inferred. */
  readonly witnessed?: { readonly fromMs: number; readonly toMs: number };
}

/** The four dimensions that narrow on an equal record field - `task` keeps its own route and
 * its own top-level field. Every one composes with the others, and with `task`, by `and`:
 * two given narrow to their intersection, never their union. */
export interface CostReportFilters {
  readonly project?: string;
  readonly step?: string;
  readonly model?: string;
  readonly tool?: string;
}

export type CostReportFilterName = keyof CostReportFilters | "task";

/** Every value a filterable field has carried anywhere the caller looked, not only in this
 * period - what lets an empty selection tell a value nobody ever recorded apart from one
 * that simply had no work here. */
export interface CostReportKnownValues {
  readonly projects: ReadonlySet<string>;
  readonly steps: ReadonlySet<string>;
  readonly models: ReadonlySet<string>;
}

/** The filter that narrowed a non-empty selection to nothing - never the period itself,
 * which is an honest zero. `combination` is present only when the value matched something
 * before any generic filter ran, so the emptiness comes from an intersection. */
export interface CostReportEmptySelection {
  readonly filter: CostReportFilterName;
  readonly value: string;
  readonly known: boolean;
  readonly combination?: boolean;
}

/** Why this machine's own identity could not be used to resolve records - two causes rather
 * than one boolean, so "the file exists but could not be read" stays apart from "nobody
 * declared one at all". */
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
  /** Restrict to the sessions that wrote into this task. Absent means the whole period: a
   * task is a filter over one, and work touching no task folder is still fully reportable. */
  readonly task?: TaskIdentity;
  /** Any of `project`, `step`, `model` and `tool`, each optional and composing with `task`
   * and each other by `and`. */
  readonly filters?: CostReportFilters;
  /** Every distinct task identity this period's records could fall inside, resolved once
   * each to its folder's declaration - gathered by the caller so the domain stays free of a
   * filesystem, and never re-resolved per record. A task this map cannot name reads as
   * `{ kind: "none" }`, so a missing entry never drops a record. */
  readonly taskBacklogDeclarations?: ReadonlyMap<TaskIdentity, TaskBacklogDeclaration>;
  /** Where a generic filter's value has ever been seen - absent when the caller has none
   * to offer, which reads the same as a filter never matching it elsewhere. */
  readonly knownValues?: CostReportKnownValues;
  /** This machine's own identity, arriving as data so the domain stays free of where the
   * identity file lives. Absent or `null` both mean none was declared, which resolves every
   * identifier as `unresolved` rather than failing the report. */
  readonly identity?: PersonIdentity | null;
  /** `"unreadable"` for a declared identity file that could not be read back, `"absent"` for
   * none declared. Either way costs the resolution alone: every record is still counted,
   * every identifier reported `unresolved`. Absent when the identity was read back fine. */
  readonly identityUnusableCause?: PersonIdentityUnusableCause;
  /** Whether the project switch is on right now, as data rather than a read this pure
   * function performs. Required, never defaulted: a default would be the silent "on" this
   * field exists to rule out. */
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
  /** From `kind: "session"` records alone and never broken down by step: no active-time
   * measure on any tool carries a step attribute. Absent when no record carried it. */
  readonly activeTimeSeconds?: number;
  readonly bySteps: readonly CostReportStepRow[];
  readonly byModels: readonly CostReportModelRow[];
  readonly byAgents: readonly CostReportAgentRow[];
  readonly byPrompts: readonly CostReportPromptRow[];
  readonly byTools: readonly CostReportToolRow[];
  readonly byProjects: readonly CostReportProjectRow[];
  readonly byTasks: readonly CostReportTaskRow[];
  readonly byBacklog: readonly CostReportBacklogRow[];
  readonly byFlows: readonly CostReportFlowRow[];
  readonly byDays: readonly CostReportDayRow[];
  /** Mapped people first, then every unplaced identity, then the one row for records
   * carrying none. Largest first within each group; never merged across the three. */
  readonly byPeople: readonly CostReportPersonRow[];
  readonly attributionMix: readonly CostReportAttributionRow[];
  /** Present only alongside `task`: an unfiltered period carries no per-record task identity
   * to break down. */
  readonly taskAttributionMix?: readonly CostReportTaskAttributionRow[];
  readonly undatedRecords: number;
  readonly unreadableLines: number;
  /** Which cause made this machine's own identity unusable for resolving records. Absent
   * when the identity was read back fine. */
  readonly identityUnusableCause?: PersonIdentityUnusableCause;
  /** Whether the project switch is on right now - never inferred from whether any record was
   * found, since an empty period and a switched-off one are different facts. Always concrete
   * here, unlike the optional input field it is resolved from. */
  readonly measurementEnabled: boolean;
}

/** Accumulates a group while keeping "never observed" distinct from "observed as zero".
 * A field stays absent until some record in the group carries it. */
export class TotalsAccumulator {
  private requests = 0;
  private costMicroUsd: number | undefined;
  private readonly counters = new Map<CounterField, number>();

  add(record: TelemetrySinkRecord): void {
    this.requests += 1;
    // `typeof`, not `!== undefined`: a record read off disk need not hold the type its field
    // declares, and `JSON.stringify(NaN)` is `null`, which would read as a known, free cost.
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

/** Mirrors `addToStepGroup`, which folds that axis' own pairs the same way. */
function addToTaskGroup(
  groups: Map<string, TaskGroup>,
  row: TaskRow,
  record: TelemetrySinkRecord
): void {
  const key = taskRowKeyOf(row);
  const existing = groups.get(key);
  if (existing) {
    existing.totals.add(record);
    return;
  }
  const created: TaskGroup =
    typeof row === "string"
      ? { reason: row, totals: new TotalsAccumulator() }
      : { task: row.task, attribution: row.attribution, totals: new TotalsAccumulator() };
  created.totals.add(record);
  groups.set(key, created);
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

function addToPromptGroup(groups: Map<PromptKey, PromptGroup>, record: TelemetrySinkRecord): void {
  const key = promptKeyOf(record);
  const group = groups.get(key) ?? { totals: new TotalsAccumulator() };
  group.totals.add(record);
  const atMs =
    record.event_timestamp === undefined ? Number.NaN : Date.parse(record.event_timestamp);
  if (!Number.isNaN(atMs) && (group.earliestMs === undefined || atMs < group.earliestMs)) {
    group.earliestMs = atMs;
  }
  groups.set(key, group);
}

/** Every group one pass over the records fills, kept together so the pass reads as one
 * decision per record rather than parallel loops over the same list. */
interface Groups {
  readonly totals: TotalsAccumulator;
  readonly steps: Map<string, StepGroup>;
  readonly models: Map<ModelKey, TotalsAccumulator>;
  readonly agents: Map<AgentKey, TotalsAccumulator>;
  readonly prompts: Map<PromptKey, PromptGroup>;
  readonly tools: Map<AiToolId, TotalsAccumulator>;
  readonly toolSessionTotals: Map<AiToolId, TotalsAccumulator>;
  readonly attributions: Map<StepAttributionSource, TotalsAccumulator>;
  readonly taskAttributions: Map<TaskAttributionSource, TotalsAccumulator>;
  readonly projects: Map<ProjectKey, TotalsAccumulator>;
  readonly tasks: Map<string, TaskGroup>;
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
    agents: new Map(),
    prompts: new Map(),
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

/** Active time is the one quantity taken from a `"session"` record: no `"request"` record on
 * any tool measured so far carries it, and a `"session"` record's money and tokens are a
 * flush window's own delta of quantities the request records already report in full, so they
 * are kept off `totals`, `bySteps` and `byDays` whatever the route. */
function accumulateSessionRecord(groups: Groups, record: TelemetrySinkRecord): void {
  // `typeof`, not `!== undefined`: `parseTelemetrySinkLine` casts everything but the schema
  // version, so `null` would read as an observed zero and a string would concatenate into
  // the running total and reach the terminal as `NaN` minutes.
  if (typeof record.active_time_s === "number") {
    groups.activeTimeSeconds = (groups.activeTimeSeconds ?? 0) + record.active_time_s;
  }
  if (record.provenance === "local-read") {
    accumulateInto(groups.toolSessionTotals, record.tool, record, (accumulator) =>
      accumulator.addTokensOnly(record)
    );
  }
}

/** Everything one record needs to be placed on every axis, resolved once per report rather
 * than once per record. */
interface RecordContext {
  readonly membership: TaskMembership | null;
  readonly taskIntervalsByVendorId: ReadonlyMap<string, readonly TaskInterval[]>;
  readonly flowIntervalsByVendorId: ReadonlyMap<string, readonly FlowInterval[]>;
  readonly journalsByVendorId: ReadonlyMap<string, CostReportSessionJournal>;
  readonly identity: PersonIdentity | null;
  readonly taskBacklogDeclarations: ReadonlyMap<TaskIdentity, TaskBacklogDeclaration> | undefined;
  readonly namesAgents: (tool: AiToolId) => boolean;
}

function accumulateRequestRecord(
  groups: Groups,
  record: TelemetrySinkRecord,
  context: RecordContext
): void {
  groups.totals.add(record);
  addToStepGroup(groups.steps, record);
  accumulateInto(groups.attributions, record.step_attribution, record);
  accumulateInto(groups.tools, record.tool, record);
  accumulateInto(groups.models, modelKeyOf(record), record);
  accumulateInto(groups.agents, agentKeyOf(record, context.namesAgents), record);
  addToPromptGroup(groups.prompts, record);
  accumulateInto(groups.projects, projectKeyOf(record), record);
  const taskRow = taskRowOf(record, context.taskIntervalsByVendorId, context.journalsByVendorId);
  addToTaskGroup(groups.tasks, taskRow, record);
  accumulateInto(groups.backlog, backlogKeyOf(taskRow, context.taskBacklogDeclarations), record);
  accumulateInto(groups.flows, flowKeyOf(record, context.flowIntervalsByVendorId), record);
  addToPersonGroup(groups.people, record, resolvePerson(context.identity, personRawIdOf(record)));
  addToDayGroup(groups.days, record);
  const { membership } = context;
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
  taskBacklogDeclarations: ReadonlyMap<TaskIdentity, TaskBacklogDeclaration> | undefined,
  declaredTools: readonly CostReportToolDeclaration[]
): Groups {
  const groups = emptyGroups(fromDay, toDay);
  const context: RecordContext = {
    membership,
    taskIntervalsByVendorId: allTaskIntervalsByVendorId(journals),
    flowIntervalsByVendorId: allFlowIntervalsByVendorId(journals),
    journalsByVendorId: new Map(journals.map((journal) => [journal.vendorId, journal])),
    identity,
    taskBacklogDeclarations,
    namesAgents: agentNamingTools(declaredTools),
  };
  for (const record of records) {
    if (record.kind === "session") accumulateSessionRecord(groups, record);
    else accumulateRequestRecord(groups, record, context);
  }
  return groups;
}

/** `task`, `filters` and `emptySelection` together - the selection this report answered, as
 * opposed to the figures it answered with. */
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

/** `undatedRecords`, `unreadableLines` and `identityUnusableCause` together - what the read
 * could not do. */
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

/** Every `by*` breakdown together. */
function breakdownFields(
  input: CostReportInput,
  groups: Groups
): Pick<
  CostReport,
  | "bySteps"
  | "byModels"
  | "byAgents"
  | "byPrompts"
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
    byAgents: agentRows(groups.agents),
    byPrompts: promptRows(groups.prompts),
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

/** One period's records and journals, reduced to a report whose every breakdown sums to the
 * total it belongs to. Money and the four token counters come from `kind: "request"` records
 * alone, active time from `kind: "session"` records alone: summing across the two kinds
 * counts the same tokens twice and produces a total that looks right. */
export function buildCostReport(input: CostReportInput): CostReport {
  // Turn-supersede first: a still-open Codex turn is down to one record before a billed-call
  // group is formed. Order is otherwise inert - the two key on disjoint fields.
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
    input.taskBacklogDeclarations,
    input.declaredTools
  );

  return assembleCostReport(input, inScope, groups, membership, emptySelection);
}

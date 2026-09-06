/** An axis owns its own key, sentinels, group shape and order, under `report/axes/`; this
 * file owns only the accumulators it constructs and the single pass that fills them. The
 * edge back to this file from `report/**` is `import type` only - a value import there
 * would recreate the cycle this split exists to avoid. */

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

/** How a record's agent came to be known, so a row that names none says which of the two
 * silences it is. `main-thread` is a measurement — the tool names agents and said this
 * record belongs to none of them; `not-stated` is the absence of one, from a tool whose
 * route never names an agent at all, and reading it as a main thread would assert a fact
 * nothing observed. */
export type AgentAttributionSource = "tool-stated" | "main-thread" | "not-stated";

/** One agent's own share of a period, `agent` absent unless `attribution` is `tool-stated`.
 *
 * Where the spend actually is: measured on a live session, ten subagent files held 432M of
 * its 466M tokens, and every one of their lines names its agent where almost none names a
 * skill (100% against 2.7%). `by_step` reads a few percent not because the reader drops
 * anything but because the host names a skill on the main thread alone.
 *
 * **The limit this axis still lives with.** A line marked as a subagent's that carries no
 * agent name reads as the main thread, because nothing on the stored record separates the
 * two. Measured 2026-09-05 across 1,852 transcripts: 157 of 122,637 subagent lines name no
 * agent, 0.07%. Closing it means a new field on the record, which no record already stored
 * could ever gain (see `storeNewCandidates`), so it is stated rather than captured. */
export interface CostReportAgentRow {
  readonly agent?: string;
  readonly attribution: AgentAttributionSource;
  readonly totals: CostTotals;
}

/** One prompt's own share of a period, `prompt` absent on the row for records that named
 * none.
 *
 * The one breakdown no host limit can empty — never one that is complete. Every other
 * depends on a capture that may not have happened — a journal, an identity file, a
 * declaration, a host that names a skill. This one depends on a field the transcript reader
 * resolves for itself, by walking `parentUuid` back to the line that named the prompt.
 *
 * The reader is very nearly complete and the sink it fills is not, and the difference is
 * worth stating where the figure is read. Measured 2026-09-05 on this machine's own sink:
 * 845 of 30,714 records carry no `prompt_id`, 2.75%. Exactly one of them was written by the
 * current reader — an assistant line whose `parentUuid` chain reaches no line naming a
 * prompt, out of 29,607 in that session. The other 844 were stored by earlier readers: 34
 * before the CLI stamped a version at all, and 810 in one session before this resolution
 * shipped.
 *
 * **Those 844 stay unnamed however often the sink is read again.** `storeNewCandidates`
 * fixes a record's field set the first time it sees the turn, so a re-read that would now
 * resolve the prompt stores nothing — the turn is already stored and its counters have not
 * grown. Re-reading is not the repair either: of the 811 whose sessions were measured, 720
 * name a request no transcript on disk still holds, so roughly 90 records in 30,714 are all
 * a retroactive pass could ever recover. Which is why this states a limit rather than
 * carrying machinery to close it.
 *
 * `startedAt` is the earliest moment in the group, and only a named prompt gets one: the
 * row for records that named no prompt is a bucket drawn from many turns, so a start moment
 * there would assert a unit that never existed. */
export interface CostReportPromptRow {
  readonly prompt?: string;
  readonly startedAt?: string;
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

/** How much of the broken-down total each strength accounts for. Printed as four figures
 * rather than as a sentence saying attribution is approximate: four numbers that sum to
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
 * `TaskUnattributedReason` names which distinct fact applies, never one label standing in
 * for all of them: no usable journal reached that record's session at all; no usable task
 * declaration exists in a session whose journal was read; a
 * task was declared but this record precedes it (whether every declaration, or the gap a `turn_end`
 * leaves before the next one); or a task was declared and the journal's own declared
 * coverage runs out before this record's moment. Never for a written file this breakdown
 * does not consult, and never split from a declaration the journal simply could not read:
 * the journal records a `task_declared` line or it does not, and those two read as
 * `"no-declaration"` alike. Up to one row per `TASK_UNATTRIBUTED_REASONS` entry actually
 * present can appear in one period - never collapsed into one, since two different gaps
 * are not one gap.
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
 *   `TaskUnattributedReason` `CostReportTaskRow` gives it; up to five such rows, one per
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
  readonly attribution: FlowAttributionSource;
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
  /** The first and last moment this journal actually witnessed, from its own lines - the
   * bound the written-file route infers inside and never outside.
   *
   * A journal witnesses only the time it was open for, which is not the time its session
   * produced records: a journal lost and recreated mid-session witnesses the minutes since,
   * while the sink still holds that session's records from days before. Measured on a live
   * machine - one session's journal began at 09:54 while its own records ran back a week -
   * and without this bound the written-file route would have attributed all seven days to a
   * task folder that session touched today.
   *
   * Absent when no line in the journal carried a moment this reader could parse: nothing
   * was witnessed, so nothing can be inferred. */
  readonly witnessed?: { readonly fromMs: number; readonly toMs: number };
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
  readonly byAgents: readonly CostReportAgentRow[];
  /** One row per prompt that caused work, largest first, plus the row for records that
   * named none — see `CostReportPromptRow`. */
  readonly byPrompts: readonly CostReportPromptRow[];
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

/** Accumulates a group while keeping "never observed" distinct from "observed as zero".
 * A field stays absent until some record in the group carries it. */
export class TotalsAccumulator {
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

/** Every group one pass over the records fills. Kept together so the pass reads as one
 * decision per record rather than as five parallel loops over the same list. */
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
  // `typeof`, not `!== undefined`, for the same reason `TotalsAccumulator` guards every
  // counter that way: `parseTelemetrySinkLine` validates `sink_schema_version` and casts
  // the rest, so a field's declared type is a claim about what this system writes, never
  // about what a line on disk holds. This one is the exception — `null`
  // is `!== undefined` and would have read as an observed zero, and a string would have
  // concatenated into the running total and reached the terminal as `NaN` minutes.
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
 * than once per record. Gathered into a shape because the list had grown past what a
 * positional signature reads as: nine parameters in a fixed order is a call nobody can check
 * by eye, and every one of them is the same for every record in the run. */
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
    input.taskBacklogDeclarations,
    input.declaredTools
  );

  return assembleCostReport(input, inScope, groups, membership, emptySelection);
}

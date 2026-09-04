import type { TelemetryRouteSupply } from "../capabilities/telemetry-capability.js";
import type {
  CostReport,
  CostReportEmptySelection,
  CostReportFilters,
  CostReportToolCoverage,
  CostTotals,
  PersonIdentityUnusableCause,
} from "./cost-report.js";
import type { PersonResolution } from "./person-resolution.js";
import type { StepAttributionSource } from "./step-attribution.js";
import type { TaskAttributionSource, TaskUnattributedReason } from "./task-attribution.js";
import type { AiToolId } from "./tool-ids.js";

/** Bumped when a consumer that understood the previous shape would misread this one.
 *
 * A version exists so a consumer can refuse rather than guess — the same reason
 * `sink_schema_version` exists on a stored line. Adding a field a consumer may ignore is
 * not a bump; changing what an existing field means is.
 *
 * Bumped to 13: `by_prompt` is a new top-level breakdown, and a consumer summing every
 * breakdown's `requests` against `totals.requests` to check nothing was dropped now has one
 * more to include. It is the only breakdown complete by construction: every other depends on
 * a capture that may not have happened, this one on a field the transcript reader already
 * resolves for every usage line. Measured 2026-09-04 on the built binary - 1073 of 1073
 * records of one real session carried a `prompt_id`, its 972 subagent records included,
 * across 12 distinct prompts.
 *
 * Bumped to 12: `by_task`'s `attribution` stops being always `"declared"`. A record no
 * declaration covers, in a session whose journal witnessed it and that wrote into exactly
 * one task folder, is now named after that folder and marked `"inferred"` - so one task can
 * hold two rows, one per route, the same `(name x attribution)` shape `by_step` already has.
 * A consumer that read `attribution` as constant, or `by_task` as one row per task,
 * misreads this version. Measured: on the one session with a complete journal, 1045 of 1073
 * records fell inside a declared interval and the remaining 27 sat between `session_start`
 * and the first declaration, 38 minutes of work before the flow named its ticket.
 *
 * Bumped to 11: a `by_task` or `by_backlog` row with no task gains a fourth possible
 * `reason`, `no-journal`. A consumer that switched exhaustively on the three before it meets
 * a value it has no case for, which is a misread rather than a field it may ignore. It
 * separates a fact about the read from a fact about the work: a session with no journal read
 * for it used to be given `no-declaration`, which asserts the session declared no task.
 * Measured 2026-09-04 - a report run from a subdirectory put 100% of a period into that row
 * while every journal sat one directory up, unread.
 *
 * Bumped to 10: `by_agent` is a new top-level breakdown, and a consumer summing every
 * breakdown's `requests` against `totals.requests` to check nothing was dropped now has one
 * more to include. It exists because that is where the spend is: on a live session, ten
 * subagent files held 432M of 466M tokens, every one of their lines naming its agent and
 * almost none its skill.
 *
 * Bumped to 9: `attribution` gains a fourth value, `prompt-matched`. A consumer that
 * understood the three before it — mapping them to labels, or switching exhaustively — meets
 * a value it has no case for, which is a misread rather than a field it may ignore. It ranks
 * above `journal-interval` and below `tool-stated`: an identifier two sources independently
 * name is stronger than an inference from moments, weaker than the tool saying it outright.
 *
 * Bumped to 8: `by_flow` is a new top-level breakdown - a consumer summing every
 * breakdown's `requests` against `totals.requests` to check nothing was dropped now has a
 * seventh breakdown to include, the same reasoning that bumped `by_backlog` in. Grouped
 * from the journal's own step sequence, read between whichever skills the domain declares
 * as orchestrating (`flow-attribution.ts`'s `ORCHESTRATING_SKILLS`) - never a second
 * capture, and never a new hook line. A row with no `flow` is the work that fell in no
 * flow interval at all; unlike `by_task` and `by_backlog`, it carries no `reason` breaking
 * that remainder down further; a flow is read from the same sequence whichever way a
 * record misses it, so there is only ever one fact to state.
 *
 * Bumped to 7: `by_backlog` is a new top-level breakdown - a consumer summing every
 * breakdown's `requests` against `totals.requests` to check nothing was dropped now has a
 * sixth breakdown to include, the same reasoning that bumped `by_task` in. Groups the same
 * per-record task membership `by_task` already computes one level higher, by what each
 * task's own folder declares (`aidd_docs/tasks/<task>/backlog-link.json`) - never a second
 * notion of which task a record belongs to. A row with no `backlog` carries `declaration`
 * (`"none"` for a task known to declare nothing, `"unreadable"` for one whose declaration
 * could not be parsed) or `reason` (the same three values `by_task` gives a record in no
 * task at all) - never both, and never neither.
 *
 * Bumped to 6: the row `by_task` gives what fell in no declared interval can now be up to
 * three rows instead of always exactly one - `reason` names which of three distinct facts
 * applies, and a consumer that read "the one row with no `task`" as a single, whole-period
 * fact would now silently sum, or read, only part of it. Summing every row's `totals`
 * still reconciles to the period total exactly as before; only the count and identity of
 * rows with no `task` changes.
 *
 * Bumped to 5: `by_task` is a new top-level breakdown - a consumer summing every
 * breakdown's requests against `totals.requests` to check nothing was dropped now has a
 * fifth breakdown to include, the same reasoning that bumped `by_project`, `by_day` and
 * `by_person` in. Grouped from the same closed intervals the pre-existing `--task` filter
 * already reads, never a second notion of when a task was running; unrelated to
 * `task_attribution`, which still exists only alongside a `--task` filter.
 *
 * Bumped to 4: `by_person` is a new top-level breakdown, and `read` gained
 * `identity_unusable` - a consumer summing every breakdown's requests against
 * `totals.requests` to check nothing was dropped now has a fourth breakdown to include,
 * the same reasoning that bumped `by_project` and `by_day` in. `identity_unusable` itself
 * was reshaped from a boolean into a named cause before this version ever shipped - see
 * the identity-is-the-person rework - so no second bump announces that change.
 *
 * Bumped to 3: `by_model`'s `model` is now absent on the row for a record neither reader
 * that permits a model-less request could name - a consumer that read it as always a
 * string on every prior version would misread this one, the same reasoning that bumped
 * `by_project`'s `project` to optional back when that row was added.
 *
 * Bumped to 2: `by_project` and `by_day` are new top-level breakdowns. */
export const COST_REPORT_ENVELOPE_VERSION = 14;

/** Money as whole micro-dollars, the way the report carries it: an integer, so a consumer
 * summing several reports gets the same answer this one did. Divide by 1,000,000 for
 * dollars, and only at the moment of display. */
export interface CostReportEnvelopeTotals {
  readonly requests: number;
  readonly cost_micro_usd?: number;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_tokens?: number;
  readonly cache_creation_tokens?: number;
}

export interface CostReportEnvelopeStepRow {
  readonly step?: string;
  readonly attribution: StepAttributionSource;
  readonly totals: CostReportEnvelopeTotals;
}

/** One model's figures, largest first, plus one row for what named none - `model` absent
 * there, the same convention `CostReportEnvelopeProjectRow` uses for what named none. */
export interface CostReportEnvelopeModelRow {
  readonly model?: string;
  readonly totals: CostReportEnvelopeTotals;
}

/** What a route was measured to supply, `null` where the tool declares no such route at
 * all — a different fact from a declared route that supplies nothing. */
export interface CostReportEnvelopeRouteSupply {
  readonly token_counters: boolean;
  readonly amount: boolean;
  readonly tool_stated_step: boolean;
}

export interface CostReportEnvelopeCapability {
  readonly local_read: CostReportEnvelopeRouteSupply | null;
  readonly export: CostReportEnvelopeRouteSupply | null;
  /** False means the run journal never names this tool's sessions: no step can be derived
   * from an interval, and a read that sweeps the journal never reaches one of its sessions
   * at all. A consumer seeing a readable tool with no figures should look here before
   * concluding it did no work. */
  readonly journal_attributable: boolean;
  readonly task_attributable: boolean;
}

export interface CostReportEnvelopeToolRow {
  readonly tool: AiToolId;
  readonly coverage: CostReportToolCoverage;
  readonly reason?: string;
  /** Read this rather than inferring from whether a figure is present. A tool that cannot
   * supply an amount and a session that cost nothing look identical in the numbers. */
  readonly capability: CostReportEnvelopeCapability;
  readonly totals: CostReportEnvelopeTotals;
  /** A local-read `kind: "session"` total, present only for a tool whose own file yields
   * one already-complete session figure rather than per-request records - today, only
   * Copilot. Never folded into `totals`, which counts billed requests alone. */
  readonly session_totals?: CostReportEnvelopeTotals;
}

export interface CostReportEnvelopeAttributionRow {
  readonly attribution: StepAttributionSource;
  readonly totals: CostReportEnvelopeTotals;
}

/** The same idea, one axis over: how much of a `--task` report's total came from a
 * declared interval versus a written file. */
export interface CostReportEnvelopeTaskAttributionRow {
  readonly attribution: TaskAttributionSource;
  readonly totals: CostReportEnvelopeTotals;
}

/** One project's figures, largest first, plus one row for what named none — `project`
 * absent there, the same convention the step row uses for `unattributed`. */
export interface CostReportEnvelopeProjectRow {
  readonly project?: string;
  readonly totals: CostReportEnvelopeTotals;
}

/** One framework task's figures, keyed on the closed interval a record's own moment falls
 * in - see `CostReportTaskRow`. `attribution` is present only alongside `task`, and says
 * which route named it: `"declared"` where a `task_declared` interval covers the record,
 * `"inferred"` where the session wrote into exactly one task folder and no declaration
 * covered it. One task can therefore carry two rows, one per route; a row for what fell in no declared interval carries `reason` instead,
 * naming which distinct fact applies - never both, and never neither. */
export interface CostReportEnvelopeTaskRow {
  readonly task?: string;
  readonly attribution?: TaskAttributionSource;
  readonly reason?: TaskUnattributedReason;
  readonly totals: CostReportEnvelopeTotals;
}

/** One backlog item's figures — see `CostReportBacklogRow`. `declaration` and `reason` are
 * never both present, and never neither, on a row with no `backlog`. */
export interface CostReportEnvelopeBacklogRow {
  readonly backlog?: string;
  readonly declaration?: "none" | "unreadable";
  readonly reason?: TaskUnattributedReason;
  readonly totals: CostReportEnvelopeTotals;
}

/** One orchestrated run's figures — see `CostReportFlowRow`. `flow` names the orchestrating
 * skill and `startedAt` when it opened, together telling apart two rows that share a name:
 * the same skill run twice in one session is two rows, never merged into one. Both are
 * absent on the one row for work that fell in no flow interval at all. */
export interface CostReportEnvelopeAgentRow {
  readonly agent?: string;
  readonly totals: CostReportEnvelopeTotals;
}

/** `started_at` is the earliest moment in the prompt, and only a named prompt carries one:
 * the row for records that named no prompt is drawn from many turns, so a start moment there
 * would assert a unit that never existed. */
export interface CostReportEnvelopePromptRow {
  readonly prompt?: string;
  readonly started_at?: string;
  readonly totals: CostReportEnvelopeTotals;
}

export interface CostReportEnvelopeFlowRow {
  readonly flow?: string;
  readonly started_at?: string;
  readonly totals: CostReportEnvelopeTotals;
}

/** One UTC day's figures. Every day the period spans, in order, whether or not a record
 * landed on it — a day with nothing is a row of zeros, never an omitted row. */
export interface CostReportEnvelopeDayRow {
  readonly day: string;
  readonly totals: CostReportEnvelopeTotals;
}

/** One person's figures — `person` is the canonical identifier, present only where
 * `resolution` is `"mapped"`; an unresolved row's raw identifier lives in `identities`
 * instead. `identities` always carries what produced the row, so a person line is
 * traceable back to its evidence without a second lookup against the mapping. */
export interface CostReportEnvelopePersonRow {
  readonly resolution: PersonResolution;
  readonly person?: string;
  readonly display_name?: string;
  readonly identities: readonly string[];
  readonly totals: CostReportEnvelopeTotals;
}

/** What the read could not do, travelling with what it did. A total assembled from a
 * partial read is indistinguishable from a complete one unless these come with it. */
export interface CostReportEnvelopeRead {
  readonly undated_records: number;
  readonly unreadable_lines: number;
  /** Which of the two possible causes made this machine's own identity unusable for
   * resolving records - `"unreadable"` for a declared identity file that could not be
   * read back, `"absent"` for no identity declared at all. Absent from this envelope
   * entirely when the identity was read back fine; `by_person` already shows a resolved
   * identity's own effect on its own. */
  readonly identity_unusable?: PersonIdentityUnusableCause;
}

/**
 * One period's report, in the shape a program reads.
 *
 * Field names are snake_case, matching the stored record a consumer may already parse.
 * Every counter is optional for the same reason it is optional there: an absent counter
 * means never observed, which is a different fact from zero, and a tool whose files carry
 * no amount has an unknown cost rather than a free one.
 */
export interface CostReportEnvelope {
  readonly cost_report_version: number;
  /** The period as it resolved, absolutely — never as it was asked for. */
  readonly period: { readonly from_day: string; readonly to_day: string };
  /** Whether the project switch is on right now, from `CostReport.measurementEnabled` -
   * carried here so `--json` and `--axis` can say what the terminal rendering already
   * does. Never derives "was this really measured" from a figure being zero: a switch off
   * and a genuinely empty period read identically in every count below, and only this
   * field tells them apart. Not a `cost_report_version` bump - a consumer that never reads
   * it sees every field it already understood mean exactly what it always meant. */
  readonly measurement_enabled: boolean;
  readonly task?: string;
  /** Only the generic filters actually given - `task` above keeps its own field,
   * unchanged. Absent for an unfiltered period. */
  readonly filters?: CostReportFilters;
  /** Present only when a filter, never the period itself, is what emptied this
   * selection - naming which one, and whether its value was ever known at all. */
  readonly empty_selection?: CostReportEmptySelection;
  readonly sessions: number;
  readonly totals: CostReportEnvelopeTotals;
  /** Per session, and never broken down by step: no active-time measure on any tool
   * carries a step attribute. Absent when no record carried it. */
  readonly active_time_s?: number;
  readonly by_step: readonly CostReportEnvelopeStepRow[];
  readonly by_model: readonly CostReportEnvelopeModelRow[];
  readonly by_tool: readonly CostReportEnvelopeToolRow[];
  readonly by_project: readonly CostReportEnvelopeProjectRow[];
  readonly by_task: readonly CostReportEnvelopeTaskRow[];
  readonly by_backlog: readonly CostReportEnvelopeBacklogRow[];
  readonly by_flow: readonly CostReportEnvelopeFlowRow[];
  /** One row per agent that ran, `agent` absent on the main thread's own row. */
  readonly by_agent: readonly CostReportEnvelopeAgentRow[];
  /** One row per prompt that caused work, largest first, plus the row for records that
   * named none. The one breakdown no host limit can empty. */
  readonly by_prompt: readonly CostReportEnvelopePromptRow[];
  /** Every day the period spans, always — a long period stays readable by how the text
   * rendering chooses to show it, never by what this envelope omits. */
  readonly by_day: readonly CostReportEnvelopeDayRow[];
  /** Mapped people first, then every unplaced identity, then the one row for records
   * carrying none at all - see `CostReport["byPeople"]`. */
  readonly by_person: readonly CostReportEnvelopePersonRow[];
  /** All three strengths, always, strongest first. */
  readonly attribution: readonly CostReportEnvelopeAttributionRow[];
  /** Present only alongside `task`: an unfiltered period carries no per-record task
   * identity to break down. */
  readonly task_attribution?: readonly CostReportEnvelopeTaskAttributionRow[];
  readonly read: CostReportEnvelopeRead;
}

function supply(from: TelemetryRouteSupply | null): CostReportEnvelopeRouteSupply | null {
  return from === null
    ? null
    : {
        token_counters: from.tokenCounters,
        amount: from.amount,
        tool_stated_step: from.toolStatedStep,
      };
}

function capability(from: CostReport["byTools"][number]["capability"]) {
  return {
    local_read: supply(from.localRead),
    export: supply(from.export),
    journal_attributable: from.journalAttributable,
    task_attributable: from.taskAttributable,
  };
}

function toolRow(row: CostReport["byTools"][number]): CostReportEnvelopeToolRow {
  return {
    tool: row.tool,
    coverage: row.coverage,
    ...(row.reason === undefined ? {} : { reason: row.reason }),
    capability: capability(row.capability),
    totals: totals(row.totals),
    ...(row.sessionTotals === undefined ? {} : { session_totals: totals(row.sessionTotals) }),
  };
}

function stepRow(row: CostReport["bySteps"][number]): CostReportEnvelopeStepRow {
  return {
    ...(row.step === undefined ? {} : { step: row.step }),
    attribution: row.attribution,
    totals: totals(row.totals),
  };
}

function totals(from: CostTotals): CostReportEnvelopeTotals {
  return {
    requests: from.requests,
    ...(from.costMicroUsd === undefined ? {} : { cost_micro_usd: from.costMicroUsd }),
    ...(from.inputTokens === undefined ? {} : { input_tokens: from.inputTokens }),
    ...(from.outputTokens === undefined ? {} : { output_tokens: from.outputTokens }),
    ...(from.cacheReadTokens === undefined ? {} : { cache_read_tokens: from.cacheReadTokens }),
    ...(from.cacheCreationTokens === undefined
      ? {}
      : { cache_creation_tokens: from.cacheCreationTokens }),
  };
}

function projectRow(row: CostReport["byProjects"][number]): CostReportEnvelopeProjectRow {
  return {
    ...(row.project === undefined ? {} : { project: row.project }),
    totals: totals(row.totals),
  };
}

function modelRow(row: CostReport["byModels"][number]): CostReportEnvelopeModelRow {
  return {
    ...(row.model === undefined ? {} : { model: row.model }),
    totals: totals(row.totals),
  };
}

function taskRow(row: CostReport["byTasks"][number]): CostReportEnvelopeTaskRow {
  return {
    ...(row.task === undefined ? {} : { task: row.task }),
    ...(row.attribution === undefined ? {} : { attribution: row.attribution }),
    ...(row.reason === undefined ? {} : { reason: row.reason }),
    totals: totals(row.totals),
  };
}

function backlogRow(row: CostReport["byBacklog"][number]): CostReportEnvelopeBacklogRow {
  return {
    ...(row.backlog === undefined ? {} : { backlog: row.backlog }),
    ...(row.declaration === undefined ? {} : { declaration: row.declaration }),
    ...(row.reason === undefined ? {} : { reason: row.reason }),
    totals: totals(row.totals),
  };
}

function agentRow(row: CostReport["byAgents"][number]): CostReportEnvelopeAgentRow {
  return { ...(row.agent === undefined ? {} : { agent: row.agent }), totals: totals(row.totals) };
}

function promptRow(row: CostReport["byPrompts"][number]): CostReportEnvelopePromptRow {
  return {
    ...(row.prompt === undefined ? {} : { prompt: row.prompt }),
    ...(row.startedAt === undefined ? {} : { started_at: row.startedAt }),
    totals: totals(row.totals),
  };
}

function flowRow(row: CostReport["byFlows"][number]): CostReportEnvelopeFlowRow {
  return {
    ...(row.flow === undefined ? {} : { flow: row.flow }),
    ...(row.startedAt === undefined ? {} : { started_at: row.startedAt }),
    totals: totals(row.totals),
  };
}

function personRow(row: CostReport["byPeople"][number]): CostReportEnvelopePersonRow {
  return {
    resolution: row.resolution,
    ...(row.person === undefined ? {} : { person: row.person }),
    ...(row.displayName === undefined ? {} : { display_name: row.displayName }),
    identities: row.identities,
    totals: totals(row.totals),
  };
}

function attributionRow(
  row: CostReport["attributionMix"][number]
): CostReportEnvelopeAttributionRow {
  return { attribution: row.attribution, totals: totals(row.totals) };
}

/** Present only alongside `task`: an unfiltered period carries no per-record task identity
 * to break down (see metrics-contract.md's "Attributing records to a task"). */
function taskAttribution(
  taskAttributionMix: CostReport["taskAttributionMix"]
): Pick<CostReportEnvelope, "task_attribution"> {
  if (taskAttributionMix === undefined) return {};
  return {
    task_attribution: taskAttributionMix.map((row) => ({
      attribution: row.attribution,
      totals: totals(row.totals),
    })),
  };
}

function readSummary(report: CostReport): CostReportEnvelopeRead {
  return {
    undated_records: report.undatedRecords,
    unreadable_lines: report.unreadableLines,
    ...(report.identityUnusableCause === undefined
      ? {}
      : { identity_unusable: report.identityUnusableCause }),
  };
}

/**
 * The same report a person reads, rendered for a program.
 *
 * A rendering, never a second computation: every figure here comes from the `CostReport`
 * it is handed, and nothing is derived on the way through. Two ways of computing one
 * number is how they start disagreeing.
 *
 * Pure — no clock, no filesystem, no printing.
 */
/** Every `by_*` breakdown together - pulled out on its own so `toCostReportEnvelope` reads
 * as one shape assembled from its own reads, not a wall of field-by-field assignments (the
 * same reason `cost-report.ts`'s own `breakdownFields` exists). */
function breakdownFields(
  report: CostReport
): Pick<
  CostReportEnvelope,
  | "by_step"
  | "by_model"
  | "by_tool"
  | "by_project"
  | "by_task"
  | "by_backlog"
  | "by_flow"
  | "by_agent"
  | "by_prompt"
  | "by_day"
  | "by_person"
> {
  return {
    by_step: report.bySteps.map(stepRow),
    by_model: report.byModels.map(modelRow),
    by_tool: report.byTools.map(toolRow),
    by_project: report.byProjects.map(projectRow),
    by_task: report.byTasks.map(taskRow),
    by_backlog: report.byBacklog.map(backlogRow),
    by_flow: report.byFlows.map(flowRow),
    by_agent: report.byAgents.map(agentRow),
    by_prompt: report.byPrompts.map(promptRow),
    by_day: report.byDays.map((row) => ({ day: row.day, totals: totals(row.totals) })),
    by_person: report.byPeople.map(personRow),
  };
}

export function toCostReportEnvelope(report: CostReport): CostReportEnvelope {
  return {
    cost_report_version: COST_REPORT_ENVELOPE_VERSION,
    period: { from_day: report.fromDay, to_day: report.toDay },
    measurement_enabled: report.measurementEnabled,
    ...(report.task === undefined ? {} : { task: report.task }),
    ...(report.filters === undefined ? {} : { filters: report.filters }),
    ...(report.emptySelection === undefined ? {} : { empty_selection: report.emptySelection }),
    sessions: report.sessions,
    totals: totals(report.totals),
    ...(report.activeTimeSeconds === undefined ? {} : { active_time_s: report.activeTimeSeconds }),
    ...breakdownFields(report),
    attribution: report.attributionMix.map(attributionRow),
    ...taskAttribution(report.taskAttributionMix),
    read: readSummary(report),
  };
}

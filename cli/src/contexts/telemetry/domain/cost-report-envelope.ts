import type { TelemetryRouteSupply } from "../../../kernel/measurement.js";
import type { AiToolId } from "../../../kernel/tool.js";
import type {
  AgentAttributionSource,
  CostReport,
  CostReportEmptySelection,
  CostReportFilters,
  CostReportToolCoverage,
  CostTotals,
  PersonIdentityUnusableCause,
} from "./cost-report.js";
import type { FlowAttributionSource } from "./flow-attribution.js";
import type { PersonResolution } from "./person-resolution.js";
import type { StepAttributionSource } from "./step-attribution.js";
import type { TaskAttributionSource, TaskUnattributedReason } from "./task-attribution.js";

/** Bumped when a consumer that understood the previous shape would misread this one, so it
 * can refuse rather than guess - the same reason `sink_schema_version` exists on a stored
 * line. Adding a field a consumer may ignore is not a bump; changing what an existing field
 * means, or adding a value to a union it switches on, is. Each bump's reason is in
 * `aidd_docs/product/cost-report-contract.md`. */
export const COST_REPORT_ENVELOPE_VERSION = 15;

/** Money as whole micro-dollars, so a consumer summing several reports gets the same answer
 * this one did. Divide by 1,000,000 for dollars, and only at the moment of display. */
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

/** Largest first, plus one row for what named none - `model` absent there. */
export interface CostReportEnvelopeModelRow {
  readonly model?: string;
  readonly totals: CostReportEnvelopeTotals;
}

/** What a route was measured to supply. `null` where the tool declares no such route at all
 * - a different fact from a declared route that supplies nothing. */
export interface CostReportEnvelopeRouteSupply {
  readonly token_counters: boolean;
  readonly amount: boolean;
  readonly tool_stated_step: boolean;
  /** The route names the agent a record belongs to, and so also says when one is the main
   * thread's own. Without it `by_agent` reads this tool's records as stating no agent. */
  readonly agent_name: boolean;
}

export interface CostReportEnvelopeCapability {
  readonly local_read: CostReportEnvelopeRouteSupply | null;
  readonly export: CostReportEnvelopeRouteSupply | null;
  /** False means the run journal never names this tool's sessions: no step can be derived
   * from an interval, and a journal sweep never reaches one of them. A consumer seeing a
   * readable tool with no figures looks here before concluding it did no work. */
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
  /** A local-read `kind: "session"` total, present only for a tool whose own file yields one
   * already-complete session figure rather than per-request records - today, only Copilot.
   * Never folded into `totals`, which counts billed requests alone. */
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

/** Largest first, plus one row for what named none - `project` absent there. */
export interface CostReportEnvelopeProjectRow {
  readonly project?: string;
  readonly totals: CostReportEnvelopeTotals;
}

/** `attribution` is present only alongside `task` and says which route named it:
 * `"declared"` where a `task_declared` interval covers the record, `"inferred"` where the
 * session wrote into exactly one task folder, so one task can carry two rows. A row for what
 * fell in no declared interval carries `reason` instead - never both, never neither. */
export interface CostReportEnvelopeTaskRow {
  readonly task?: string;
  readonly attribution?: TaskAttributionSource;
  readonly reason?: TaskUnattributedReason;
  readonly totals: CostReportEnvelopeTotals;
}

/** On a row with no `backlog`, `declaration` and `reason` are never both present and never
 * neither. */
export interface CostReportEnvelopeBacklogRow {
  readonly backlog?: string;
  readonly declaration?: "none" | "unreadable";
  readonly reason?: TaskUnattributedReason;
  readonly totals: CostReportEnvelopeTotals;
}

/** `agent` is present exactly when `attribution` is `tool-stated`. The two rows naming none
 * are different facts, never merged: `main-thread` is a tool that names agents saying this
 * record belongs to none, `not-stated` a tool whose route never names one. */
export interface CostReportEnvelopeAgentRow {
  readonly agent?: string;
  readonly attribution: AgentAttributionSource;
  readonly totals: CostReportEnvelopeTotals;
}

/** `started_at` is the earliest moment in the prompt, and only a named prompt carries one:
 * the unnamed row is drawn from many turns, so a start moment would assert a unit that never
 * existed. */
export interface CostReportEnvelopePromptRow {
  readonly prompt?: string;
  readonly started_at?: string;
  readonly totals: CostReportEnvelopeTotals;
}

/** `attribution` says how this flow came to be known: `journal-interval` for one the journal
 * opened and closed, `tool-stated` for one only a record's own tool named, `unattributed`
 * for work that joined neither. A `tool-stated` row carries no `started_at` - it is a bucket
 * drawn from however many runs of that skill the tool named, and a name is not a run. */
export interface CostReportEnvelopeFlowRow {
  readonly flow?: string;
  readonly attribution: FlowAttributionSource;
  readonly started_at?: string;
  readonly totals: CostReportEnvelopeTotals;
}

/** Every day the period spans, in order, whether or not a record landed on it - a day with
 * nothing is a row of zeros, never an omitted row. */
export interface CostReportEnvelopeDayRow {
  readonly day: string;
  readonly totals: CostReportEnvelopeTotals;
}

/** `person` is the canonical identifier, present only where `resolution` is `"mapped"`; an
 * unresolved row's raw identifier lives in `identities` instead, which always carries what
 * produced the row so a person line is traceable back to its evidence. */
export interface CostReportEnvelopePersonRow {
  readonly resolution: PersonResolution;
  readonly person?: string;
  readonly display_name?: string;
  readonly identities: readonly string[];
  readonly totals: CostReportEnvelopeTotals;
}

/** What the read could not do, travelling with what it did: a total assembled from a partial
 * read is indistinguishable from a complete one unless these come with it. */
export interface CostReportEnvelopeRead {
  readonly undated_records: number;
  readonly unreadable_lines: number;
  /** `"unreadable"` for a declared identity file that could not be read back, `"absent"` for
   * none declared at all. Absent entirely when the identity was read back fine. */
  readonly identity_unusable?: PersonIdentityUnusableCause;
}

/** One period's report in the shape a program reads, field names snake_case to match the
 * stored record a consumer may already parse. Every counter is optional for the same reason
 * it is optional there: absent means never observed, a different fact from zero. */
export interface CostReportEnvelope {
  readonly cost_report_version: number;
  /** The period as it resolved, absolutely — never as it was asked for. */
  readonly period: { readonly from_day: string; readonly to_day: string };
  /** Whether the project switch is on right now, carried so `--json` and `--axis` say what
   * the terminal rendering does. A switch off and a genuinely empty period read identically
   * in every count below, and only this field tells them apart. */
  readonly measurement_enabled: boolean;
  readonly task?: string;
  /** Only the generic filters actually given - `task` above keeps its own field. Absent for
   * an unfiltered period. */
  readonly filters?: CostReportFilters;
  /** Present only when a filter, never the period itself, emptied this selection - naming
   * which one, and whether its value was ever known at all. */
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
  readonly by_prompt: readonly CostReportEnvelopePromptRow[];
  /** Every day the period spans, always - a long period stays readable by how the text
   * rendering chooses to show it, never by what this envelope omits. */
  readonly by_day: readonly CostReportEnvelopeDayRow[];
  /** Mapped people first, then every unplaced identity, then the one row for records
   * carrying none at all. */
  readonly by_person: readonly CostReportEnvelopePersonRow[];
  /** All four strengths, always, strongest first. */
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
        agent_name: from.agentName,
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
  return {
    ...(row.agent === undefined ? {} : { agent: row.agent }),
    attribution: row.attribution,
    totals: totals(row.totals),
  };
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
    attribution: row.attribution,
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
 * to break down. */
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

/** Every `by_*` breakdown together. */
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

/** A rendering, never a second computation: every figure comes from the `CostReport` handed
 * in and nothing is derived on the way through, since two ways of computing one number is
 * how they start disagreeing. Pure - no clock, no filesystem, no printing. */
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

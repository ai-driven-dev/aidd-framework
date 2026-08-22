import type { TelemetryRouteSupply } from "../capabilities/telemetry-capability.js";
import type { CostReport, CostReportToolCoverage, CostTotals } from "./cost-report.js";
import type { StepAttributionSource } from "./step-attribution.js";
import type { TaskAttributionSource } from "./task-attribution.js";
import type { AiToolId } from "./tool-ids.js";

/** Bumped when a consumer that understood the previous shape would misread this one.
 *
 * A version exists so a consumer can refuse rather than guess — the same reason
 * `sink_schema_version` exists on a stored line. Adding a field a consumer may ignore is
 * not a bump; changing what an existing field means is.
 *
 * Bumped to 2: `by_project` and `by_day` are new top-level breakdowns. */
export const COST_REPORT_ENVELOPE_VERSION = 2;

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

export interface CostReportEnvelopeModelRow {
  readonly model: string;
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

/** One UTC day's figures. Every day the period spans, in order, whether or not a record
 * landed on it — a day with nothing is a row of zeros, never an omitted row. */
export interface CostReportEnvelopeDayRow {
  readonly day: string;
  readonly totals: CostReportEnvelopeTotals;
}

/** What the read could not do, travelling with what it did. A total assembled from a
 * partial read is indistinguishable from a complete one unless these come with it. */
export interface CostReportEnvelopeRead {
  readonly undated_records: number;
  readonly unreadable_lines: number;
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
  readonly task?: string;
  readonly sessions: number;
  readonly totals: CostReportEnvelopeTotals;
  /** Per session, and never broken down by step: no active-time measure on any tool
   * carries a step attribute. Absent when no record carried it. */
  readonly active_time_s?: number;
  readonly by_step: readonly CostReportEnvelopeStepRow[];
  readonly by_model: readonly CostReportEnvelopeModelRow[];
  readonly by_tool: readonly CostReportEnvelopeToolRow[];
  readonly by_project: readonly CostReportEnvelopeProjectRow[];
  /** Every day the period spans, always — a long period stays readable by how the text
   * rendering chooses to show it, never by what this envelope omits. */
  readonly by_day: readonly CostReportEnvelopeDayRow[];
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

/**
 * The same report a person reads, rendered for a program.
 *
 * A rendering, never a second computation: every figure here comes from the `CostReport`
 * it is handed, and nothing is derived on the way through. Two ways of computing one
 * number is how they start disagreeing.
 *
 * Pure — no clock, no filesystem, no printing.
 */
export function toCostReportEnvelope(report: CostReport): CostReportEnvelope {
  return {
    cost_report_version: COST_REPORT_ENVELOPE_VERSION,
    period: { from_day: report.fromDay, to_day: report.toDay },
    ...(report.task === undefined ? {} : { task: report.task }),
    sessions: report.sessions,
    totals: totals(report.totals),
    ...(report.activeTimeSeconds === undefined ? {} : { active_time_s: report.activeTimeSeconds }),
    by_step: report.bySteps.map(stepRow),
    by_model: report.byModels.map((row) => ({ model: row.model, totals: totals(row.totals) })),
    by_tool: report.byTools.map(toolRow),
    by_project: report.byProjects.map(projectRow),
    by_day: report.byDays.map((row) => ({ day: row.day, totals: totals(row.totals) })),
    attribution: report.attributionMix.map(attributionRow),
    ...taskAttribution(report.taskAttributionMix),
    read: {
      undated_records: report.undatedRecords,
      unreadable_lines: report.unreadableLines,
    },
  };
}

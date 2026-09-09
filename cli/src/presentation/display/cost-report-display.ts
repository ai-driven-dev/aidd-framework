import type {
  CostReport,
  CostReportAttributionRow,
  CostReportBacklogRow,
  CostReportDayRow,
  CostReportEmptySelection,
  CostReportFilterName,
  CostReportFilters,
  CostReportProjectRow,
  CostReportStepRow,
  CostReportTaskAttributionRow,
  CostReportTaskRow,
  CostReportToolRow,
  CostTotals,
} from "../../contexts/telemetry/domain/cost-report.js";
import { fromMicroUsd } from "../../contexts/telemetry/domain/cost-report.js";
import type { StepAttributionSource } from "../../contexts/telemetry/domain/step-attribution.js";
import type {
  TaskAttributionSource,
  TaskUnattributedReason,
} from "../../contexts/telemetry/domain/task-attribution.js";
import { getAiToolConfig } from "../../contexts/tools/domain/registry.js";
import type { CLIOutput } from "../output.js";

/** `unattributed` says nothing could attribute this, never that the work ran outside every
 * step: on at least one measured tool the two are indistinguishable. */
export const ATTRIBUTION_LABELS: Record<StepAttributionSource, string> = {
  "tool-stated": "stated by the tool",
  "prompt-matched": "matched on the prompt",
  "journal-interval": "from a journal interval",
  unattributed: "unattributed",
};

export const TASK_ATTRIBUTION_LABELS: Record<TaskAttributionSource, string> = {
  declared: "declared by the flow",
  inferred: "inferred from a written file",
};

/** One label per reason, never one standing in for all of them. The wording keeps three kinds
 * apart: a fact about the read ("no usable run journal", meaning none was attachable at all,
 * against "no usable task declaration", meaning one was read and named nothing), a fact about
 * a record's own age, and facts about how the work behaved. A resumed transcript's inherited
 * turns were billed before this session opened a journal, so their row is worded as age and
 * never as a complaint about declaring. */
export const TASK_UNATTRIBUTED_LABELS: Record<TaskUnattributedReason, string> = {
  "no-journal": "no usable run journal for this session",
  "precedes-journal": "older than anything this session's journal witnessed",
  "no-declaration": "no usable task declaration in this session",
  "precedes-declaration": "before the next task this session declares",
  "journal-silent": "the journal falls silent before this record",
};

/** A known task that names no item or whose declaration could not be parsed — distinct from
 * `TASK_UNATTRIBUTED_LABELS`, which is about belonging to no task at all. */
export const BACKLOG_DECLARATION_LABELS: Record<"none" | "unreadable", string> = {
  none: "this task declares no backlog item",
  unreadable: "this task's backlog declaration could not be read",
};

/** Never `$0.00`: a tool whose own files carry no amount has an unknown cost, not a free one.
 * Exported so a second renderer prints the identical words. */
export const UNKNOWN_AMOUNT = "amount unknown";
/** Distinct from an unknown amount and from a zero: this one really did measure nothing. Not
 * exported — outside readers go through `nothingLabel`, which picks between the two. */
const NOTHING_MEASURED = "nothing in this period";
/** The same zero under a narrowing selection: `task` and every filter cut the record set
 * before any breakdown runs, so saying "period" there would be false about time. */
const NOTHING_IN_SELECTION = "nothing in this selection";
/** Never merged into the request-based figure beside it, and never called "cost" or
 * "requests", being neither. */
const SESSION_TOTAL_LABEL = "session total, not requests";
const LABEL_WIDTH = 26;
const NO_KNOWN_PROJECT = "no known project";
const NO_KNOWN_MODEL = "no known model";
// Not "no agent": the main thread is where a session starts, not an absence.
const MAIN_THREAD = "the main thread";
// Nor the main thread: a tool that names no agent has said nothing about which one ran.
const AGENT_NOT_STATED = "the tool names no agent";

/** What a row that names no agent is called, by which of the two silences it is. */
export function agentRowLabel(row: CostReport["byAgents"][number]): string {
  if (row.agent !== undefined) return row.agent;
  return row.attribution === "main-thread" ? MAIN_THREAD : AGENT_NOT_STATED;
}

// A prompt id is a uuid, wider than `LABEL_WIDTH`, and `padTo` never truncates.
const PROMPT_WIDTH = 38;
const NO_PROMPT = "no prompt named";
// One row per turn, unbounded where every other axis has a small vocabulary. Truncated
// rather than suppressed the way `printDays` suppresses: a top N of a ranking is honest
// where a partial series is not, and the line below says how many were withheld.
const MAX_PRINTED_PROMPTS = 10;

// A year by day is 365 rows: above this the text rendering names the count and points at
// --json rather than printing a screen nobody can scan. The envelope still carries them all.
const MAX_PRINTED_DAYS = 31;

/** Exported alongside `formatAmount` and `totalTokens` so a second renderer formats the same
 * figures through the same routine. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatAmount(microUsd: number): string {
  return `$${fromMicroUsd(microUsd).toFixed(2)}`;
}

/** The four counters are disjoint on every reader here — `input` excludes the cache figures —
 * so adding them counts nothing twice. */
export function totalTokens(totals: CostTotals): number {
  return (
    (totals.inputTokens ?? 0) +
    (totals.outputTokens ?? 0) +
    (totals.cacheReadTokens ?? 0) +
    (totals.cacheCreationTokens ?? 0)
  );
}

/** Cost where the period has one, tokens where it does not, so a period of tools that carry
 * no amount still breaks down. Named in the output, so nobody has to guess which. */
export function shareBasis(totals: CostTotals): { readonly label: string; readonly of: number } {
  return totals.costMicroUsd === undefined
    ? { label: "of tokens", of: totalTokens(totals) }
    : { label: "of cost", of: totals.costMicroUsd };
}

/** Exported for the same reason `shareBasis` is. */
export function shareOf(totals: CostTotals, basis: number, useCost: boolean): string {
  if (basis === 0) return "  - ";
  const part = useCost ? (totals.costMicroUsd ?? 0) : totalTokens(totals);
  return `${Math.round((part / basis) * 100)
    .toString()
    .padStart(3)}%`;
}

/** `padEnd` returns a longer string unchanged, so a label wider than the column runs straight
 * into what follows it — a project id is a whole git remote. Exported so every column-padded
 * reader of a label shares the one guarantee rather than each risking that collision. */
export function padTo(label: string, width: number): string {
  return label.length >= width ? `${label} ` : label.padEnd(width);
}

function pad(label: string): string {
  return padTo(label, LABEL_WIDTH);
}

/** `task` and the generic filters both narrow the record set before any breakdown runs, so
 * either one means every zero downstream is the selection talking, not the period. */
function hasSelection(report: Pick<CostReport, "task" | "filters">): boolean {
  return report.task !== undefined || report.filters !== undefined;
}

/** Never a bare `0`, and never `NOTHING_MEASURED` under a selection, whose own narrowing is
 * what emptied it. Exported so a second renderer tells the two absences apart the same way. */
export function nothingLabel(report: Pick<CostReport, "task" | "filters">): string {
  return hasSelection(report) ? NOTHING_IN_SELECTION : NOTHING_MEASURED;
}

/** In the fixed order `cost-report.ts` gives them; empty for an unfiltered period. */
function filtersSuffix(filters: CostReportFilters | undefined): string {
  if (!filters) return "";
  const parts = Object.entries(filters).map(([name, value]) => `${name}=${value}`);
  return parts.length === 0 ? "" : `    filters: ${parts.join(", ")}`;
}

// `task` and `tool` are checked against journals and a declared list, never against a record,
// so "no record" would claim a check this layer never ran.
const UNKNOWN_REASON: Partial<Record<CostReportFilterName, string>> = {
  task: "no journal has ever declared it or written into it",
  tool: "it is not one of the tools this build knows",
};

function unknownReason(filter: CostReportFilterName): string {
  return UNKNOWN_REASON[filter] ?? `no record has ever named this ${filter}`;
}

/** A period that genuinely holds no work never reaches here: an `emptySelection` is carried
 * only when a filter, never the period, is what emptied it. */
export function emptySelectionMessage({
  filter,
  value,
  known,
  combination,
}: CostReportEmptySelection): string {
  if (!known) return `  ${filter} '${value}' matched nothing — ${unknownReason(filter)}`;
  if (combination)
    return `  ${filter} '${value}' matched nothing combined with the rest of this selection`;
  return `  ${filter} '${value}' matched nothing in this selection — known, but no work here`;
}

/** Never a bare `0`, the same refusal `requests` makes below: a session count is no less a
 * claim about what was measured. */
export function sessionsFigure(report: CostReport): string {
  return report.sessions === 0 ? nothingLabel(report) : formatCount(report.sessions);
}

/** `0` where there are no tokens to divide, never `NaN`. `tokens` is a parameter because
 * every caller already holds it, and this stays the one place the rounding happens. */
export function cacheReadSharePercent(totals: CostTotals, tokens: number): number {
  return tokens === 0 ? 0 : Math.round(((totals.cacheReadTokens ?? 0) / tokens) * 100);
}

function printTotals(output: CLIOutput, report: CostReport): void {
  const { totals } = report;
  if (totals.requests === 0) {
    output.print(`  ${pad("sessions")}${sessionsFigure(report)}`);
    output.print(`  ${pad("requests")}${nothingLabel(report)}`);
    return;
  }
  const tokens = totalTokens(totals);
  const cacheShare = cacheReadSharePercent(totals, tokens);
  output.print(`  ${pad("sessions")}${sessionsFigure(report)}`);
  output.print(`  ${pad("requests")}${formatCount(totals.requests)}`);
  output.print(`  ${pad("tokens")}${formatCount(tokens)}    ${cacheShare}% cache`);
  output.print(
    `  ${pad("cost")}${totals.costMicroUsd === undefined ? UNKNOWN_AMOUNT : formatAmount(totals.costMicroUsd)}`
  );
  if (report.activeTimeSeconds !== undefined) {
    const minutes = Math.round(report.activeTimeSeconds / 60);
    output.print(
      `  ${pad("active time")}${formatCount(minutes)} min    per session; not attributable to steps`
    );
  }
}

function figureFor(totals: CostTotals, useCost: boolean): string {
  if (!useCost) return `${formatCount(totalTokens(totals))} tokens`;
  return totals.costMicroUsd === undefined ? UNKNOWN_AMOUNT : formatAmount(totals.costMicroUsd);
}

function printStepRows(
  output: CLIOutput,
  rows: readonly CostReportStepRow[],
  basis: number,
  useCost: boolean
): void {
  for (const row of rows) {
    const name = row.step ?? ATTRIBUTION_LABELS.unattributed;
    const strength = row.step === undefined ? "" : `    ${ATTRIBUTION_LABELS[row.attribution]}`;
    output.print(
      `    ${pad(name)}${shareOf(row.totals, basis, useCost)}   ${figureFor(row.totals, useCost)}${strength}`
    );
  }
}

function printAttributionRows(
  output: CLIOutput,
  rows: readonly CostReportAttributionRow[],
  basis: number,
  useCost: boolean
): void {
  for (const row of rows) {
    output.print(
      `    ${pad(ATTRIBUTION_LABELS[row.attribution])}${shareOf(row.totals, basis, useCost)}`
    );
  }
}

/** Every declared tool, including the ones that can say nothing: a tool missing from the list
 * reads as one that did nothing, which for an unreadable tool is a false zero. */
function printToolRows(
  output: CLIOutput,
  rows: readonly CostReportToolRow[],
  report: Pick<CostReport, "task" | "filters">
): void {
  for (const row of rows) {
    const name = getAiToolConfig(row.tool).displayName;
    if (row.coverage === "not-covered") {
      output.print(`    ${pad(name)}not covered${row.reason ? ` — ${row.reason}` : ""}`);
      continue;
    }
    if (row.totals.requests === 0 && row.sessionTotals) {
      const tokens = `${formatCount(totalTokens(row.sessionTotals))} tokens (${SESSION_TOTAL_LABEL})`;
      output.print(`    ${pad(name)}${tokens}${row.reason ? ` — ${row.reason}` : ""}`);
      continue;
    }
    if (row.totals.requests === 0) {
      output.print(
        `    ${pad(name)}${nothingLabel(report)}${row.reason ? ` — ${row.reason}` : ""}`
      );
      continue;
    }
    const figure =
      row.totals.costMicroUsd === undefined
        ? UNKNOWN_AMOUNT
        : formatAmount(row.totals.costMicroUsd);
    const tokens = `${formatCount(totalTokens(row.totals))} tokens`;
    output.print(`    ${pad(name)}${figure}   ${tokens}${row.reason ? ` — ${row.reason}` : ""}`);
  }
}

function printCaveats(output: CLIOutput, report: CostReport): void {
  if (report.undatedRecords > 0) {
    output.print(
      `  ${formatCount(report.undatedRecords)} records carry no moment and are in no period`
    );
  }
  if (report.unreadableLines > 0) {
    output.print(`  ${formatCount(report.unreadableLines)} lines could not be read`);
  }
}

/** An empty group prints nothing at all, never a heading over silence. */
interface Basis {
  readonly label: string;
  readonly of: number;
  readonly useCost: boolean;
}

/** Only where `--task` narrowed the report: without one there is no per-record task identity
 * to break down. */
function printTaskAttribution(output: CLIOutput, report: CostReport, basis: Basis): void {
  if (report.taskAttributionMix === undefined) return;
  output.print("");
  output.print(`  ticket known    ${basis.label}`);
  printTaskAttributionRows(output, report.taskAttributionMix, basis.of, basis.useCost);
}

function printTaskAttributionRows(
  output: CLIOutput,
  rows: readonly CostReportTaskAttributionRow[],
  basis: number,
  useCost: boolean
): void {
  for (const row of rows) {
    output.print(
      `    ${pad(TASK_ATTRIBUTION_LABELS[row.attribution])}${shareOf(row.totals, basis, useCost)}`
    );
  }
}

function printStepsAndAttribution(output: CLIOutput, report: CostReport, basis: Basis): void {
  if (report.bySteps.length === 0) return;
  output.print("");
  output.print(`  by step    ${basis.label}`);
  printStepRows(output, report.bySteps, basis.of, basis.useCost);
  output.print("");
  output.print(`  attribution    ${basis.label}`);
  printAttributionRows(output, report.attributionMix, basis.of, basis.useCost);
}

/** Straight after the steps, because it answers what they cannot: on a session that
 * delegates, the step axis names a few percent and this one names the rest. */
function printAgents(output: CLIOutput, report: CostReport, basis: Basis): void {
  if (report.byAgents.length === 0) return;
  output.print("");
  output.print(`  by agent    ${basis.label}`);
  for (const row of report.byAgents) {
    const name = agentRowLabel(row);
    const share = shareOf(row.totals, basis.of, basis.useCost);
    output.print(
      `    ${padTo(name, LABEL_WIDTH)}${share}   ${figureFor(row.totals, basis.useCost)}`
    );
  }
}

/** The one axis no host limit can empty: every record the transcript reader resolves carries
 * a `prompt_id`, where a skill name, an identity and a declaration each may be missing. */
function printPrompts(output: CLIOutput, report: CostReport, basis: Basis): void {
  if (report.byPrompts.length === 0) return;
  output.print("");
  output.print(`  by prompt   ${basis.label}`);
  for (const row of report.byPrompts.slice(0, MAX_PRINTED_PROMPTS)) {
    const share = shareOf(row.totals, basis.of, basis.useCost);
    output.print(
      `    ${padTo(row.prompt ?? NO_PROMPT, PROMPT_WIDTH)}${padTo(row.startedAt ?? "", 22)}${share}   ${figureFor(row.totals, basis.useCost)}`
    );
  }
  const withheld = report.byPrompts.length - MAX_PRINTED_PROMPTS;
  if (withheld > 0) {
    output.print(`    ${formatCount(withheld)} more prompts — see --json for all of them`);
  }
}

function printModels(output: CLIOutput, report: CostReport, basis: Basis): void {
  if (report.byModels.length === 0) return;
  output.print("");
  output.print(`  by model    ${basis.label}`);
  for (const row of report.byModels) {
    const name = row.model ?? NO_KNOWN_MODEL;
    const share = shareOf(row.totals, basis.of, basis.useCost);
    output.print(`    ${pad(name)}${share}   ${figureFor(row.totals, basis.useCost)}`);
  }
}

function printProjects(
  output: CLIOutput,
  rows: readonly CostReportProjectRow[],
  basis: Basis
): void {
  if (rows.length === 0) return;
  output.print("");
  output.print(`  by project    ${basis.label}`);
  for (const row of rows) {
    const name = row.project ?? NO_KNOWN_PROJECT;
    const share = shareOf(row.totals, basis.of, basis.useCost);
    output.print(`    ${pad(name)}${share}   ${figureFor(row.totals, basis.useCost)}`);
  }
}

/** One row per task a record's moment fell inside, then one per reason present, in
 * `TASK_UNATTRIBUTED_REASONS`' fixed order after every named task. The attribution sits beside
 * a named row for the same reason `printStepRows` puts it there. */
function printTasks(output: CLIOutput, rows: readonly CostReportTaskRow[], basis: Basis): void {
  if (rows.length === 0) return;
  output.print("");
  output.print(`  by task    ${basis.label}`);
  for (const row of rows) {
    const name = row.task ?? (row.reason === undefined ? "" : TASK_UNATTRIBUTED_LABELS[row.reason]);
    const strength =
      row.attribution === undefined ? "" : `    ${TASK_ATTRIBUTION_LABELS[row.attribution]}`;
    output.print(
      `    ${pad(name)}${shareOf(row.totals, basis.of, basis.useCost)}   ${figureFor(row.totals, basis.useCost)}${strength}`
    );
  }
}

/** Named items, then the two rows for a known task that named none or could not be read, then
 * the reason rows — the tail order `printTasks` uses. No attribution column: a backlog row
 * rests on one route only. */
function printBacklog(
  output: CLIOutput,
  rows: readonly CostReportBacklogRow[],
  basis: Basis
): void {
  if (rows.length === 0) return;
  output.print("");
  output.print(`  by backlog item    ${basis.label}`);
  for (const row of rows) {
    const name =
      row.backlog ??
      (row.declaration !== undefined
        ? BACKLOG_DECLARATION_LABELS[row.declaration]
        : row.reason !== undefined
          ? TASK_UNATTRIBUTED_LABELS[row.reason]
          : "");
    output.print(
      `    ${pad(name)}${shareOf(row.totals, basis.of, basis.useCost)}   ${figureFor(row.totals, basis.useCost)}`
    );
  }
}

/** Chronological, never sorted by size: a series read out of order is not a series. Past
 * `MAX_PRINTED_DAYS` a count replaces the rows, since dropping some would be false
 * continuity. */
function printDays(
  output: CLIOutput,
  rows: readonly CostReportDayRow[],
  report: Pick<CostReport, "task" | "filters">
): void {
  if (rows.length === 0) return;
  output.print("");
  output.print("  by day");
  if (rows.length > MAX_PRINTED_DAYS) {
    output.print(
      `    ${formatCount(rows.length)} days in this period — see --json for the daily breakdown`
    );
    return;
  }
  for (const row of rows) {
    if (row.totals.requests === 0) {
      output.print(`    ${pad(row.day)}${nothingLabel(report)}`);
      continue;
    }
    const figure =
      row.totals.costMicroUsd === undefined
        ? UNKNOWN_AMOUNT
        : formatAmount(row.totals.costMicroUsd);
    output.print(`    ${pad(row.day)}${figure}   ${formatCount(totalTokens(row.totals))} tokens`);
  }
}

/** Prints no amount it was not given — the rates live outside this repository — and no
 * prompt, code, diff or file path: a task appears by its identity alone. */
function printHeader(output: CLIOutput, report: CostReport): void {
  const scope = report.task === undefined ? "period" : `task ${report.task}`;
  output.print(`${scope}    ${report.fromDay} to ${report.toDay}${filtersSuffix(report.filters)}`);
  // Only the off state is worth a line: with the switch on, every figure below already shows
  // it working. Never worded "measurement is off for this project" — the sink is scoped to
  // this person, so the figures can be real work from anywhere the switch was ever on, and a
  // sentence claiming nothing was measured would contradict a genuine count beside it.
  if (!report.measurementEnabled) {
    output.print(
      "this project's own switch is off — the figures below are not scoped to it, they are " +
        "the whole sink; turn this project's measurement on with `aidd telemetry on`"
    );
  }
  output.print("");
  if (report.emptySelection !== undefined) {
    output.print(emptySelectionMessage(report.emptySelection));
    output.print("");
  }
}

// A filter-emptied selection has nothing to break down: every row would read "nothing in this
// period", the false zero this layer refuses.
function printBreakdowns(output: CLIOutput, report: CostReport): void {
  const basis: Basis = {
    ...shareBasis(report.totals),
    useCost: report.totals.costMicroUsd !== undefined,
  };
  printTaskAttribution(output, report, basis);
  printStepsAndAttribution(output, report, basis);
  printAgents(output, report, basis);
  printPrompts(output, report, basis);
  printModels(output, report, basis);
  printProjects(output, report.byProjects, basis);
  printTasks(output, report.byTasks, basis);
  printBacklog(output, report.byBacklog, basis);
  output.print("");
  output.print("  by tool");
  printToolRows(output, report.byTools, report);
  printDays(output, report.byDays, report);
}

export function printCostReport(output: CLIOutput, report: CostReport): void {
  printHeader(output, report);
  printTotals(output, report);
  if (report.emptySelection === undefined) printBreakdowns(output, report);
  printCaveats(output, report);
}

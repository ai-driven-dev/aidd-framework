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
} from "../../domain/models/cost-report.js";
import { fromMicroUsd } from "../../domain/models/cost-report.js";
import type { StepAttributionSource } from "../../domain/models/step-attribution.js";
import type {
  TaskAttributionSource,
  TaskUnattributedReason,
} from "../../domain/models/task-attribution.js";
import { getAiToolConfig } from "../../domain/tools/registry.js";
import type { CLIOutput } from "../output.js";

/** What each strength of attribution is called where a person reads it. `unattributed`
 * says nothing could attribute this, and deliberately not that the work ran outside every
 * step: on at least one measured tool the two are indistinguishable, and the stronger
 * reading would be a fact this layer invented. */
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

/** What each reason a record fell in no declared interval is called where a person reads
 * it - never one label standing in for all of them, which is the fault this breakdown
 * exists to avoid (see `CostReportTaskRow`).
 *
 * The first names a fact about the read, the rest facts about the work, and the wording
 * keeps them apart: "no usable run journal" says this layer never had a journal it could
 * attach to this session - none read, or one read whose header was torn - where "no usable
 * task declaration" says it had one and found no declaration in it. */
export const TASK_UNATTRIBUTED_LABELS: Record<TaskUnattributedReason, string> = {
  "no-journal": "no usable run journal for this session",
  "no-declaration": "no usable task declaration in this session",
  "precedes-declaration": "before the next task this session declares",
  "journal-silent": "the journal falls silent before this record",
};

/** What a known task's own two non-item states are called where a person reads them -
 * distinct from `TASK_UNATTRIBUTED_LABELS`, which names why a record belongs to no task at
 * all. Both of these are about a task that *is* known, whose folder either names nothing or
 * whose declaration could not be parsed. */
export const BACKLOG_DECLARATION_LABELS: Record<"none" | "unreadable", string> = {
  none: "this task declares no backlog item",
  unreadable: "this task's backlog declaration could not be read",
};

/** Printed where a figure is genuinely not known, never as `$0.00`. A tool whose own files
 * carry no amount has an unknown cost, not a free one. Exported so another renderer of the
 * same report — the interactive telemetry screen — prints the identical words rather than
 * a second literal that could drift from this one. */
export const UNKNOWN_AMOUNT = "amount unknown";
/** A covered tool with no records, and a wholly unfiltered period with none at all.
 * Distinct from both an unknown amount and a zero: this one really did measure nothing,
 * and saying so is the only reading the records support. Not exported: every reader outside
 * this module reaches this string through `nothingLabel`, which decides between this and
 * `NOTHING_IN_SELECTION` — never through the literal itself. */
const NOTHING_MEASURED = "nothing in this period";
/** The same zero, under a selection narrower than the whole period. `task` and every
 * generic filter already narrow the record set before any breakdown is computed, so a
 * zero row under either is caused by the selection, not by real idleness - saying
 * "period" there would be a false statement about time. */
const NOTHING_IN_SELECTION = "nothing in this selection";
/** What a tool's `sessionTotals` figure is called wherever it is printed - never merged
 * into the request-based figure beside it, and never called "cost" or "requests" since it
 * is neither. */
const SESSION_TOTAL_LABEL = "session total, not requests";
const LABEL_WIDTH = 26;
const NO_KNOWN_PROJECT = "no known project";
const NO_KNOWN_MODEL = "no known model";
// Not "no agent": the main thread is where a session starts, not an absence.
const MAIN_THREAD = "the main thread";

// A year asked for by day is 365 rows - the envelope always carries every one of them, but
// a terminal is not the place to read that many. Above this, the text rendering names the
// count and points at --json rather than printing a screen nobody can scan. Must match
// render.cjs's own MAX_PRINTED_DAYS: the byte-compare e2e test holds the two to it.
const MAX_PRINTED_DAYS = 31;

/** Exported alongside `formatAmount` and `totalTokens` so the interactive telemetry screen
 * renders the same figures this text report does, rather than a second formatting routine
 * that could read a count differently from this one. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatAmount(microUsd: number): string {
  return `$${fromMicroUsd(microUsd).toFixed(2)}`;
}

/** Every token a record counted, across the four disjoint counters — a tool's `input` is
 * exclusive of its cache figures on every reader here, so adding them counts nothing
 * twice. Exported for the same reason `formatCount` is. */
export function totalTokens(totals: CostTotals): number {
  return (
    (totals.inputTokens ?? 0) +
    (totals.outputTokens ?? 0) +
    (totals.cacheReadTokens ?? 0) +
    (totals.cacheCreationTokens ?? 0)
  );
}

/** What a share is taken of. Cost where the period has one, tokens where it does not — a
 * period made only of tools that carry no amount still breaks down, by the quantity it
 * does have. Named in the output so nobody has to guess which. Exported so the interactive
 * telemetry screen takes a row's share by the identical rule this text report already
 * applies to every breakdown, rather than a second percentage rule that could drift from
 * this one. */
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

/** A label, in a column of `width` — and always followed by something.
 *
 * `padEnd` returns a longer string unchanged, so a label wider than the column would run
 * straight into whatever comes after it: a real project id is the repository's own remote,
 * and `git@github.com:…/framework.git` printed as `…framework.git100%`. Measured on a live
 * report; no fixture had ever carried an identifier that long. Exported so every
 * column-padded reader of a label — this file's own `pad`, and the interactive telemetry
 * screen's row list, whose own attribution-carrying labels (F2) are wider still — shares
 * this one guarantee rather than each risking the same collision at its own width. */
export function padTo(label: string, width: number): string {
  return label.length >= width ? `${label} ` : label.padEnd(width);
}

function pad(label: string): string {
  return padTo(label, LABEL_WIDTH);
}

/** `task` and the four generic filters both narrow the record set before any breakdown
 * runs, so either one - alone or together - means every zero downstream is the selection
 * talking, not the period. Every row measured against this reads unambiguously: nothing
 * a filter can produce here escapes being counted as in-scope or out, so there is no row
 * this call cannot decide for. */
function hasSelection(report: Pick<CostReport, "task" | "filters">): boolean {
  return report.task !== undefined || report.filters !== undefined;
}

/** Never a bare `0` and never `NOTHING_MEASURED` under a selection: `task` and the four
 * generic filters both narrow the record set before any breakdown runs, so a zero under
 * either reads as the selection's own doing, not the period's. Exported so the interactive
 * telemetry screen tells the two absences apart the identical way this text report already
 * does, rather than a second rule that could drift from this one. */
export function nothingLabel(report: Pick<CostReport, "task" | "filters">): string {
  return hasSelection(report) ? NOTHING_IN_SELECTION : NOTHING_MEASURED;
}

/** `name=value` for every active generic filter, in the fixed order `cost-report.ts`
 * gives them - empty for an unfiltered period. */
function filtersSuffix(filters: CostReportFilters | undefined): string {
  if (!filters) return "";
  const parts = Object.entries(filters).map(([name, value]) => `${name}=${value}`);
  return parts.length === 0 ? "" : `    filters: ${parts.join(", ")}`;
}

// What "never known" means differs by filter: `task` and `tool` are checked against
// journals and a declared list, never against a record, so saying "no record" for either
// would claim a check this layer never ran.
const UNKNOWN_REASON: Partial<Record<CostReportFilterName, string>> = {
  task: "no journal has ever declared it or written into it",
  tool: "it is not one of the tools this build knows",
};

function unknownReason(filter: CostReportFilterName): string {
  return UNKNOWN_REASON[filter] ?? `no record has ever named this ${filter}`;
}

/** What a filter matching nothing says, told apart from a period that genuinely holds no
 * work: that case never reaches here, since the report only ever carries an
 * `emptySelection` when a filter - not the period itself - is what emptied it. Exported so
 * the interactive telemetry screen names the same culprit in the same words, rather than a
 * second rendering of `CostReportEmptySelection` that could disagree with this one. */
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

/** Never a bare `0`: a period nothing was measured in reads as "nothing in this period"
 * (or selection), the same refusal `requests` already makes below - a session count is no
 * less a claim about what was measured than a request count is. Exported for the same
 * reason `formatCount` is. */
export function sessionsFigure(report: CostReport): string {
  return report.sessions === 0 ? nothingLabel(report) : formatCount(report.sessions);
}

/** Cache reads' share of `tokens`, rounded to a whole percent - `0` when there are no
 * tokens to divide, never `NaN`. `tokens` arrives as a parameter rather than being
 * recomputed here: every caller already has its own `totalTokens(totals)` at hand, and
 * this stays the one place the rounding happens rather than a formula copied at each call
 * site. Exported so the interactive telemetry screen reads the same figure through this one
 * function rather than a second copy that could drift from it. */
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

/** Every declared tool, including the ones that can say nothing. A tool missing from this
 * list is a tool a reader takes for one that did nothing, and for an unreadable one that
 * is the false zero this whole layer exists to prevent. */
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

/** A breakdown reads as a group: a blank line, a heading naming what its shares are taken
 * of, then its rows. Empty groups print nothing at all rather than a heading over silence. */
interface Basis {
  readonly label: string;
  readonly of: number;
  readonly useCost: boolean;
}

/** Only where `--task` narrowed the report - a session without one carries no per-record
 * task identity to break down (see metrics-contract.md), so there is nothing here to print
 * for the unfiltered period. */
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

/** Printed straight after the steps, because it answers what they cannot: on a session that
 * delegates, the step axis names a few percent and this one names the rest. Measured — ten
 * subagent files held 432M of a live session's 466M tokens. */
function printAgents(output: CLIOutput, report: CostReport, basis: Basis): void {
  if (report.byAgents.length === 0) return;
  output.print("");
  output.print(`  by agent    ${basis.label}`);
  for (const row of report.byAgents) {
    const name = row.agent ?? MAIN_THREAD;
    const share = shareOf(row.totals, basis.of, basis.useCost);
    output.print(
      `    ${padTo(name, LABEL_WIDTH)}${share}   ${figureFor(row.totals, basis.useCost)}`
    );
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

/** One row per task a record's own moment fell inside, plus up to four rows for what fell
 * in none - one per reason present, always after every named task and in
 * `TASK_UNATTRIBUTED_REASONS`' own fixed order, the same placement `byPeople` gives its own
 * no-identifier row. Carries the attribution beside a named row for the same reason
 * `printStepRows` does: a figure that rests on a closed interval says so next to the
 * number, not only in a document elsewhere. */
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

/** One row per backlog item a task in the period declared, plus the two rows for a known
 * task that named none or could not be read, plus up to four reason rows for a record in
 * no task at all - the same tail order `printTasks` gives its own remainder. No attribution
 * column: unlike a task's closed interval, a backlog row rests on one route only. */
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

/** Chronological, never sorted by size: a series read out of order is not a series. Above
 * `MAX_PRINTED_DAYS`, a person reads a count and where to get the rest - the envelope
 * still carries every day, since suppressing a row there would be the same false
 * continuity this layer refuses everywhere else. */
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

/**
 * One period's cost, as a person reads it.
 *
 * Prints no amount it was not given: the rates live outside this repository, so a tool
 * whose files carry none says so rather than showing zero. Prints every declared tool,
 * including the ones nothing here can read, with the reason from their own declaration.
 * Carries no prompt, code, diff or file path - a task appears by its identity, never by
 * the paths it was derived from.
 */
function printHeader(output: CLIOutput, report: CostReport): void {
  const scope = report.task === undefined ? "period" : `task ${report.task}`;
  output.print(`${scope}    ${report.fromDay} to ${report.toDay}${filtersSuffix(report.filters)}`);
  // Only the off state is worth a line: a person reading a report with the switch on
  // already sees it working, in every figure below - stating "measurement is on" beside
  // them would be the same noise `identityUnusableCause` avoids by never printing on the
  // ordinary path. What this refuses is the false continuity of showing a stale or empty
  // period with no word that nothing new can be recorded right now.
  //
  // Named for what it is, not "measurement is off for this project": the sink this report
  // reads is scoped to this person, not to this project, so the figures below can be real
  // work from anywhere the switch was ever on - the category error a person ran into
  // reading a genuine count under a sentence claiming nothing was measured. This says
  // exactly what the switch and the figures each actually are, so neither reads as
  // contradicting the other (review.md, "one route, and every sentence about it true",
  // finding 2).
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

// A filter-emptied selection has nothing under any breakdown to show - every row would
// read "nothing in this period", which is exactly the false zero this layer refuses.
function printBreakdowns(output: CLIOutput, report: CostReport): void {
  const basis: Basis = {
    ...shareBasis(report.totals),
    useCost: report.totals.costMicroUsd !== undefined,
  };
  printTaskAttribution(output, report, basis);
  printStepsAndAttribution(output, report, basis);
  printAgents(output, report, basis);
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

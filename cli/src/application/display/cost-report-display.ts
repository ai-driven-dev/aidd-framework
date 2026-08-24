import type {
  CostReport,
  CostReportAttributionRow,
  CostReportDayRow,
  CostReportEmptySelection,
  CostReportFilterName,
  CostReportFilters,
  CostReportProjectRow,
  CostReportStepRow,
  CostReportTaskAttributionRow,
  CostReportToolRow,
  CostTotals,
} from "../../domain/models/cost-report.js";
import { fromMicroUsd } from "../../domain/models/cost-report.js";
import type { StepAttributionSource } from "../../domain/models/step-attribution.js";
import type { TaskAttributionSource } from "../../domain/models/task-attribution.js";
import { getAiToolConfig } from "../../domain/tools/registry.js";
import type { CLIOutput } from "../output.js";

/** What each strength of attribution is called where a person reads it. `unattributed`
 * says nothing could attribute this, and deliberately not that the work ran outside every
 * step: on at least one measured tool the two are indistinguishable, and the stronger
 * reading would be a fact this layer invented. */
const ATTRIBUTION_LABELS: Record<StepAttributionSource, string> = {
  "tool-stated": "stated by the tool",
  "journal-interval": "from a journal interval",
  unattributed: "unattributed",
};

const TASK_ATTRIBUTION_LABELS: Record<TaskAttributionSource, string> = {
  declared: "declared by the flow",
  inferred: "inferred from a written file",
};

/** Printed where a figure is genuinely not known, never as `$0.00`. A tool whose own files
 * carry no amount has an unknown cost, not a free one. */
const UNKNOWN_AMOUNT = "amount unknown";
/** A covered tool with no records, and a wholly unfiltered period with none at all.
 * Distinct from both an unknown amount and a zero: this one really did measure nothing,
 * and saying so is the only reading the records support. */
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

// A year asked for by day is 365 rows - the envelope always carries every one of them, but
// a terminal is not the place to read that many. Above this, the text rendering names the
// count and points at --json rather than printing a screen nobody can scan. Must match
// render.cjs's own MAX_PRINTED_DAYS: the byte-compare e2e test holds the two to it.
const MAX_PRINTED_DAYS = 31;

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatAmount(microUsd: number): string {
  return `$${fromMicroUsd(microUsd).toFixed(2)}`;
}

/** Every token a record counted, across the four disjoint counters — a tool's `input` is
 * exclusive of its cache figures on every reader here, so adding them counts nothing
 * twice. */
function totalTokens(totals: CostTotals): number {
  return (
    (totals.inputTokens ?? 0) +
    (totals.outputTokens ?? 0) +
    (totals.cacheReadTokens ?? 0) +
    (totals.cacheCreationTokens ?? 0)
  );
}

/** What a share is taken of. Cost where the period has one, tokens where it does not — a
 * period made only of tools that carry no amount still breaks down, by the quantity it
 * does have. Named in the output so nobody has to guess which. */
function shareBasis(totals: CostTotals): { readonly label: string; readonly of: number } {
  return totals.costMicroUsd === undefined
    ? { label: "of tokens", of: totalTokens(totals) }
    : { label: "of cost", of: totals.costMicroUsd };
}

function shareOf(totals: CostTotals, basis: number, useCost: boolean): string {
  if (basis === 0) return "  - ";
  const part = useCost ? (totals.costMicroUsd ?? 0) : totalTokens(totals);
  return `${Math.round((part / basis) * 100)
    .toString()
    .padStart(3)}%`;
}

function pad(label: string): string {
  return label.padEnd(LABEL_WIDTH);
}

/** `task` and the four generic filters both narrow the record set before any breakdown
 * runs, so either one - alone or together - means every zero downstream is the selection
 * talking, not the period. Every row measured against this reads unambiguously: nothing
 * a filter can produce here escapes being counted as in-scope or out, so there is no row
 * this call cannot decide for. */
function hasSelection(report: Pick<CostReport, "task" | "filters">): boolean {
  return report.task !== undefined || report.filters !== undefined;
}

function nothingLabel(report: Pick<CostReport, "task" | "filters">): string {
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
 * `emptySelection` when a filter - not the period itself - is what emptied it. */
function emptySelectionMessage({
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

function printTotals(output: CLIOutput, report: CostReport): void {
  const { totals } = report;
  if (totals.requests === 0) {
    output.print(`  ${pad("sessions")}${formatCount(report.sessions)}`);
    output.print(`  ${pad("requests")}${nothingLabel(report)}`);
    return;
  }
  const tokens = totalTokens(totals);
  const cacheShare = tokens === 0 ? 0 : Math.round(((totals.cacheReadTokens ?? 0) / tokens) * 100);
  output.print(`  ${pad("sessions")}${formatCount(report.sessions)}`);
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
export function printCostReport(output: CLIOutput, report: CostReport): void {
  const scope = report.task === undefined ? "period" : `task ${report.task}`;
  output.print(`${scope}    ${report.fromDay} to ${report.toDay}${filtersSuffix(report.filters)}`);
  output.print("");
  if (report.emptySelection !== undefined) {
    output.print(emptySelectionMessage(report.emptySelection));
    output.print("");
  }
  printTotals(output, report);

  // A filter-emptied selection has nothing under any breakdown to show - every row would
  // read "nothing in this period", which is exactly the false zero this layer refuses.
  if (report.emptySelection === undefined) {
    const basis: Basis = {
      ...shareBasis(report.totals),
      useCost: report.totals.costMicroUsd !== undefined,
    };
    printTaskAttribution(output, report, basis);
    printStepsAndAttribution(output, report, basis);
    printModels(output, report, basis);
    printProjects(output, report.byProjects, basis);
    output.print("");
    output.print("  by tool");
    printToolRows(output, report.byTools, report);
    printDays(output, report.byDays, report);
  }
  printCaveats(output, report);
}

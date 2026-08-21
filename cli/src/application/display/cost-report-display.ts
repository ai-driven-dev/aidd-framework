import type {
  CostReport,
  CostReportAttributionRow,
  CostReportStepRow,
  CostReportToolRow,
  CostTotals,
} from "../../domain/models/cost-report.js";
import { fromMicroUsd } from "../../domain/models/cost-report.js";
import type { StepAttributionSource } from "../../domain/models/step-attribution.js";
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

/** Printed where a figure is genuinely not known, never as `$0.00`. A tool whose own files
 * carry no amount has an unknown cost, not a free one. */
const UNKNOWN_AMOUNT = "amount unknown";
/** A covered tool with no records, and a period with none at all. Distinct from both an
 * unknown amount and a zero: this one really did measure nothing, and saying so is the
 * only reading the records support. */
const NOTHING_MEASURED = "nothing in this period";
const LABEL_WIDTH = 26;

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

function printTotals(output: CLIOutput, report: CostReport): void {
  const { totals } = report;
  if (totals.requests === 0) {
    output.print(`  ${pad("sessions")}${formatCount(report.sessions)}`);
    output.print(`  ${pad("requests")}${NOTHING_MEASURED}`);
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
function printToolRows(output: CLIOutput, rows: readonly CostReportToolRow[]): void {
  for (const row of rows) {
    const name = getAiToolConfig(row.tool).displayName;
    if (row.coverage === "not-covered") {
      output.print(`    ${pad(name)}not covered${row.reason ? ` — ${row.reason}` : ""}`);
      continue;
    }
    if (row.totals.requests === 0) {
      output.print(`    ${pad(name)}${NOTHING_MEASURED}${row.reason ? ` — ${row.reason}` : ""}`);
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
    const share = shareOf(row.totals, basis.of, basis.useCost);
    output.print(`    ${pad(row.model)}${share}   ${figureFor(row.totals, basis.useCost)}`);
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
  output.print(`${scope}    ${report.fromDay} to ${report.toDay}`);
  output.print("");
  printTotals(output, report);

  const basis: Basis = {
    ...shareBasis(report.totals),
    useCost: report.totals.costMicroUsd !== undefined,
  };
  printStepsAndAttribution(output, report, basis);
  printModels(output, report, basis);
  output.print("");
  output.print("  by tool");
  printToolRows(output, report.byTools);
  printCaveats(output, report);
}

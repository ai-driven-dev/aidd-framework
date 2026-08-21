// The two renderings of one report: one for a person, one for a program.
//
// Neither derives a figure the other cannot see. Two ways of computing one number is how
// they start disagreeing.

const { DISPLAY_NAME } = require("./readers.js");
const { tokensOf } = require("./report.js");

const ENVELOPE_VERSION = 1;
const MICRO_USD_PER_USD = 1e6;
const LABEL_WIDTH = 26;

const ATTRIBUTION_LABELS = {
  "tool-stated": "stated by the tool",
  "journal-interval": "from a journal interval",
  unattributed: "unattributed",
};

/** Printed where a figure is genuinely not known, never as `$0.00`: a tool whose files
 * carry no amount has an unknown cost, not a free one. */
const UNKNOWN_AMOUNT = "amount unknown";
/** A covered tool that measured nothing, and a period holding nothing. The one place a
 * zero really is the measurement. */
const NOTHING_MEASURED = "nothing in this period";

const count = (value) => value.toLocaleString("en-US");
const amount = (microUsd) => `$${(microUsd / MICRO_USD_PER_USD).toFixed(2)}`;
const pad = (label) => label.padEnd(LABEL_WIDTH);

/** Shares are of cost where the period has one and of tokens where it does not, so a
 * period made only of tools that carry no amount still breaks down. */
function basisOf(totals) {
  const useCost = totals.costMicroUsd !== undefined;
  return {
    label: useCost ? "of cost" : "of tokens",
    of: useCost ? totals.costMicroUsd : tokensOf(totals),
    useCost,
  };
}

function share(totals, basis) {
  if (basis.of === 0) return "  - ";
  const part = basis.useCost ? (totals.costMicroUsd ?? 0) : tokensOf(totals);
  return `${Math.round((part / basis.of) * 100)
    .toString()
    .padStart(3)}%`;
}

function figure(totals, basis) {
  if (!basis.useCost) return `${count(tokensOf(totals))} tokens`;
  return totals.costMicroUsd === undefined ? UNKNOWN_AMOUNT : amount(totals.costMicroUsd);
}

function printTotals(out, report) {
  const { totals } = report;
  out(`  ${pad("sessions")}${count(report.sessions)}`);
  if (totals.requests === 0) {
    out(`  ${pad("requests")}${NOTHING_MEASURED}`);
    return;
  }
  const tokens = tokensOf(totals);
  const cache = tokens === 0 ? 0 : Math.round(((totals.cacheReadTokens ?? 0) / tokens) * 100);
  out(`  ${pad("requests")}${count(totals.requests)}`);
  out(`  ${pad("tokens")}${count(tokens)}    ${cache}% cache`);
  out(
    `  ${pad("cost")}${totals.costMicroUsd === undefined ? UNKNOWN_AMOUNT : amount(totals.costMicroUsd)}`
  );
  if (report.activeTimeSeconds !== undefined) {
    const minutes = Math.round(report.activeTimeSeconds / 60);
    out(`  ${pad("active time")}${count(minutes)} min    per session; not attributable to steps`);
  }
}

function printSteps(out, report, basis) {
  if (report.bySteps.length === 0) return;
  out("");
  out(`  by step    ${basis.label}`);
  for (const row of report.bySteps) {
    const name = row.step ?? ATTRIBUTION_LABELS.unattributed;
    const strength = row.step === undefined ? "" : `    ${ATTRIBUTION_LABELS[row.attribution]}`;
    out(`    ${pad(name)}${share(row.totals, basis)}   ${figure(row.totals, basis)}${strength}`);
  }
  out("");
  out(`  attribution    ${basis.label}`);
  for (const row of report.attributionMix) {
    out(`    ${pad(ATTRIBUTION_LABELS[row.attribution])}${share(row.totals, basis)}`);
  }
}

function printModels(out, report, basis) {
  if (report.byModels.length === 0) return;
  out("");
  out(`  by model    ${basis.label}`);
  for (const row of report.byModels) {
    out(`    ${pad(row.model)}${share(row.totals, basis)}   ${figure(row.totals, basis)}`);
  }
}

/** Every declared tool, including the ones that can say nothing. A tool missing here is
 * one a reader takes for idle, and for an unreadable one that is the false zero this whole
 * layer exists to prevent. */
function printTools(out, report) {
  out("");
  out("  by tool");
  for (const row of report.byTools) {
    const name = DISPLAY_NAME[row.tool];
    const because = row.reason ? ` — ${row.reason}` : "";
    if (row.coverage === "not-covered") {
      out(`    ${pad(name)}not covered${because}`);
    } else if (row.totals.requests === 0) {
      out(`    ${pad(name)}${NOTHING_MEASURED}${because}`);
    } else {
      const money =
        row.totals.costMicroUsd === undefined ? UNKNOWN_AMOUNT : amount(row.totals.costMicroUsd);
      out(`    ${pad(name)}${money}   ${count(tokensOf(row.totals))} tokens${because}`);
    }
  }
}

function printCaveats(out, report) {
  if (report.undatedRecords > 0) {
    out(`  ${count(report.undatedRecords)} records carry no moment and are in no period`);
  }
  if (report.unreadableLines > 0) {
    out(`  ${count(report.unreadableLines)} lines could not be read`);
  }
}

function printReport(out, report) {
  out(`${report.task === undefined ? "period" : `task ${report.task}`}    ${report.fromDay} to ${report.toDay}`);
  out("");
  printTotals(out, report);
  const basis = basisOf(report.totals);
  printSteps(out, report, basis);
  printModels(out, report, basis);
  printTools(out, report);
  printCaveats(out, report);
}

// The machine-readable rendering ------------------------------------------------------

function envelopeTotals(totals) {
  return {
    requests: totals.requests,
    ...(totals.costMicroUsd === undefined ? {} : { cost_micro_usd: totals.costMicroUsd }),
    ...(totals.inputTokens === undefined ? {} : { input_tokens: totals.inputTokens }),
    ...(totals.outputTokens === undefined ? {} : { output_tokens: totals.outputTokens }),
    ...(totals.cacheReadTokens === undefined
      ? {}
      : { cache_read_tokens: totals.cacheReadTokens }),
    ...(totals.cacheCreationTokens === undefined
      ? {}
      : { cache_creation_tokens: totals.cacheCreationTokens }),
  };
}

function envelopeSupply(supply) {
  return supply === null
    ? null
    : {
        token_counters: supply.tokenCounters,
        amount: supply.amount,
        tool_stated_step: supply.toolStatedStep,
      };
}

/** Field names are snake_case, matching the stored record a consumer may already parse.
 * `cost_report_version` exists so an unrecognised shape can be refused rather than
 * guessed at. */
function toEnvelope(report) {
  return {
    cost_report_version: ENVELOPE_VERSION,
    period: { from_day: report.fromDay, to_day: report.toDay },
    ...(report.task === undefined ? {} : { task: report.task }),
    sessions: report.sessions,
    totals: envelopeTotals(report.totals),
    ...(report.activeTimeSeconds === undefined
      ? {}
      : { active_time_s: report.activeTimeSeconds }),
    by_step: report.bySteps.map((row) => ({
      ...(row.step === undefined ? {} : { step: row.step }),
      attribution: row.attribution,
      totals: envelopeTotals(row.totals),
    })),
    by_model: report.byModels.map((row) => ({
      model: row.model,
      totals: envelopeTotals(row.totals),
    })),
    by_tool: report.byTools.map((row) => ({
      tool: row.tool,
      coverage: row.coverage,
      ...(row.reason === undefined ? {} : { reason: row.reason }),
      capability: {
        local_read: envelopeSupply(row.capability.localRead),
        export: envelopeSupply(row.capability.export),
        journal_attributable: row.capability.journalAttributable,
        task_attributable: row.capability.taskAttributable,
      },
      totals: envelopeTotals(row.totals),
    })),
    attribution: report.attributionMix.map((row) => ({
      attribution: row.attribution,
      totals: envelopeTotals(row.totals),
    })),
    read: { undated_records: report.undatedRecords, unreadable_lines: report.unreadableLines },
  };
}

module.exports = { ENVELOPE_VERSION, printReport, toEnvelope };

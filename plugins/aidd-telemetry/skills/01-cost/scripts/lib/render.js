// The two renderings of one report: one for a person, one for a program.
//
// Neither derives a figure the other cannot see. Two ways of computing one number is how
// they start disagreeing.

const { DISPLAY_NAME } = require("./readers.js");
const { tokensOf } = require("./report.js");

// Bumped from 1: `by_day` and `by_project` are new top-level breakdowns, a shape change a
// consumer built against version 1 could not have anticipated.
const ENVELOPE_VERSION = 2;
const MICRO_USD_PER_USD = 1e6;
const LABEL_WIDTH = 26;

const ATTRIBUTION_LABELS = {
  "tool-stated": "stated by the tool",
  "journal-interval": "from a journal interval",
  unattributed: "unattributed",
};

const NO_KNOWN_PROJECT = "no known project";

// A year asked for by day is 365 rows - the envelope always carries every one of them, but
// a terminal is not the place to read that many. Above this, the text rendering names the
// count and points at --json rather than printing a screen nobody can scan.
const MAX_PRINTED_DAYS = 31;

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

function printProjects(out, report, basis) {
  if (report.byProjects.length === 0) return;
  out("");
  out(`  by project    ${basis.label}`);
  for (const row of report.byProjects) {
    const name = row.project ?? NO_KNOWN_PROJECT;
    out(`    ${pad(name)}${share(row.totals, basis)}   ${figure(row.totals, basis)}`);
  }
}

/** Chronological, never sorted by size: a series read out of order is not a series. Above
 * `MAX_PRINTED_DAYS`, a person reads a count and where to get the rest - the envelope
 * still carries every day, since suppressing a row there would be the same false
 * continuity this layer refuses everywhere else. */
function printDays(out, report) {
  if (report.byDays.length === 0) return;
  out("");
  out("  by day");
  if (report.byDays.length > MAX_PRINTED_DAYS) {
    out(`    ${count(report.byDays.length)} days in this period — see --json for the daily breakdown`);
    return;
  }
  for (const row of report.byDays) {
    if (row.totals.requests === 0) {
      out(`    ${pad(row.day)}${NOTHING_MEASURED}`);
      continue;
    }
    const money =
      row.totals.costMicroUsd === undefined ? UNKNOWN_AMOUNT : amount(row.totals.costMicroUsd);
    out(`    ${pad(row.day)}${money}   ${count(tokensOf(row.totals))} tokens`);
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
  printProjects(out, report, basis);
  printTools(out, report);
  printDays(out, report);
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
    by_project: report.byProjects.map((row) => ({
      ...(row.project === undefined ? {} : { project: row.project }),
      totals: envelopeTotals(row.totals),
    })),
    // Every day in the period, always - a person's own reading of it is what the text
    // rendering has to keep legible; the envelope never omits one to make that easier.
    by_day: report.byDays.map((row) => ({ day: row.day, totals: envelopeTotals(row.totals) })),
    attribution: report.attributionMix.map((row) => ({
      attribution: row.attribution,
      totals: envelopeTotals(row.totals),
    })),
    read: { undated_records: report.undatedRecords, unreadable_lines: report.unreadableLines },
  };
}

// The artefact renderings ---------------------------------------------------------------
//
// One per axis, and every one reads `toEnvelope`'s own output - never the report that fed
// it. A figure that only the envelope could disprove is a figure this file never invents.

const ARTEFACT_AXES = ["total", "day", "step", "model", "tool", "project"];

function envelopeTokens(totals) {
  return (
    (totals.input_tokens ?? 0) +
    (totals.output_tokens ?? 0) +
    (totals.cache_read_tokens ?? 0) +
    (totals.cache_creation_tokens ?? 0)
  );
}

function artefactFigure(totals) {
  if (totals.requests === 0) return NOTHING_MEASURED;
  const cost = totals.cost_micro_usd === undefined ? UNKNOWN_AMOUNT : amount(totals.cost_micro_usd);
  return `${cost} — ${count(envelopeTokens(totals))} tokens, ${count(totals.requests)} requests`;
}

/** States the period and the axis on every artefact, so a figure copied out of the session
 * that made it can still be placed - the same reason a chart names its own axes. */
function artefactHeader(envelope, axisLabel) {
  const { from_day, to_day } = envelope.period;
  const task = envelope.task === undefined ? "" : `, task ${envelope.task}`;
  return `period ${from_day} to ${to_day}${task} — axis: ${axisLabel}`;
}

function artefactCaveats(envelope) {
  const lines = [];
  if (envelope.read.undated_records > 0) {
    lines.push(`${count(envelope.read.undated_records)} records carry no moment and are in no period`);
  }
  if (envelope.read.unreadable_lines > 0) {
    lines.push(`${count(envelope.read.unreadable_lines)} lines could not be read`);
  }
  return lines;
}

/** One total, in a line: the answer to "what did this cost". */
function totalArtefact(envelope) {
  return [artefactHeader(envelope, "total"), "", artefactFigure(envelope.totals), ...artefactCaveats(envelope)].join(
    "\n"
  );
}

/** A series, one row per day, in order - every day the period spans, gap included, and
 * never capped the way the terminal rendering caps at `MAX_PRINTED_DAYS`: a file is where a
 * long series belongs, and dropping rows there would be the same false continuity that cap
 * exists to prevent in a terminal. The answer to "what changed". */
function dayArtefact(envelope) {
  const rows = envelope.by_day.map((row) => `| ${row.day} | ${artefactFigure(row.totals)} |`);
  return [
    artefactHeader(envelope, "by day"),
    "",
    "| Day | Total |",
    "| --- | --- |",
    ...rows,
    ...artefactCaveats(envelope),
  ].join("\n");
}

/** A breakdown table for one of `by_step`, `by_model` or `by_project` - the "where did it
 * go" answer, minus the share and attribution columns the inline reading adds: a table
 * meant to be pasted elsewhere carries the figures, not a computed percentage of them. */
function breakdownArtefact(envelope, axis, column, nameOf) {
  const rows = envelope[`by_${axis}`].map((row) => `| ${nameOf(row)} | ${artefactFigure(row.totals)} |`);
  return [
    artefactHeader(envelope, `by ${axis}`),
    "",
    `| ${column} | Total |`,
    "| --- | --- |",
    ...rows,
    ...artefactCaveats(envelope),
  ].join("\n");
}

const stepArtefact = (envelope) => breakdownArtefact(envelope, "step", "Step", (row) => row.step ?? "unattributed");
const modelArtefact = (envelope) => breakdownArtefact(envelope, "model", "Model", (row) => row.model);
const projectArtefact = (envelope) =>
  breakdownArtefact(envelope, "project", "Project", (row) => row.project ?? NO_KNOWN_PROJECT);

/** A tool that cannot be read at all is never a zero: its row says so instead of printing a
 * figure nothing measured. */
function toolArtefact(envelope) {
  const rows = envelope.by_tool.map((row) => {
    const because = row.reason ? ` — ${row.reason}` : "";
    const value = row.coverage === "not-covered" ? `not covered${because}` : `${artefactFigure(row.totals)}${because}`;
    return `| ${DISPLAY_NAME[row.tool]} | ${value} |`;
  });
  return [
    artefactHeader(envelope, "by tool"),
    "",
    "| Tool | Total |",
    "| --- | --- |",
    ...rows,
    ...artefactCaveats(envelope),
  ].join("\n");
}

const ARTEFACT_BUILDERS = {
  total: totalArtefact,
  day: dayArtefact,
  step: stepArtefact,
  model: modelArtefact,
  tool: toolArtefact,
  project: projectArtefact,
};

/** The one entry point: an axis name in, the artefact that answers it out. An axis this
 * does not know is refused by name, with the ones it does - never guessed at. */
function buildArtefact(envelope, axis) {
  const builder = ARTEFACT_BUILDERS[axis];
  if (!builder) throw new Error(`Unknown axis '${axis}'. Expected one of: ${ARTEFACT_AXES.join(", ")}.`);
  return builder(envelope);
}

module.exports = { ENVELOPE_VERSION, printReport, toEnvelope, ARTEFACT_AXES, buildArtefact };

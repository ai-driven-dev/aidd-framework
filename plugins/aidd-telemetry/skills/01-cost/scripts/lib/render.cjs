// The two renderings of one report: one for a person, one for a program.
//
// Neither derives a figure the other cannot see. Two ways of computing one number is how
// they start disagreeing.

const { DISPLAY_NAME } = require("./readers.cjs");
const { tokensOf } = require("./report.cjs");

// Bumped from 2: `by_model`'s `model` is now absent on the row for a record neither reader
// that permits a model-less request could name - a consumer that read it as always a
// string on every prior version would misread this one. Bumped from 1: `by_day` and
// `by_project` are new top-level breakdowns, a shape change a consumer built against
// version 1 could not have anticipated. Mirrors
// cli/src/domain/models/cost-report-envelope.ts's COST_REPORT_ENVELOPE_VERSION.
const ENVELOPE_VERSION = 3;
const MICRO_USD_PER_USD = 1e6;
const LABEL_WIDTH = 26;

const ATTRIBUTION_LABELS = {
  "tool-stated": "stated by the tool",
  "journal-interval": "from a journal interval",
  unattributed: "unattributed",
};

const TASK_ATTRIBUTION_LABELS = {
  declared: "declared by the flow",
  inferred: "inferred from a written file",
};

const NO_KNOWN_PROJECT = "no known project";
const NO_KNOWN_MODEL = "no known model";

// A year asked for by day is 365 rows - the envelope always carries every one of them, but
// a terminal is not the place to read that many. Above this, the text rendering names the
// count and points at --json rather than printing a screen nobody can scan.
const MAX_PRINTED_DAYS = 31;

/** Printed where a figure is genuinely not known, never as `$0.00`: a tool whose files
 * carry no amount has an unknown cost, not a free one. */
const UNKNOWN_AMOUNT = "amount unknown";
/** A covered tool that measured nothing, and a wholly unfiltered period holding nothing.
 * The one place a zero really is the measurement of time passing with nothing happening. */
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

const count = (value) => value.toLocaleString("en-US");
const amount = (microUsd) => `$${(microUsd / MICRO_USD_PER_USD).toFixed(2)}`;

/** `task` and the four generic filters both narrow the record set before any breakdown
 * runs, so either one - alone or together - means every zero downstream is the selection
 * talking, not the period. Every row measured against this reads unambiguously: nothing
 * a filter can produce here escapes being counted as in-scope or out, so there is no row
 * this call cannot decide for. */
function hasSelection(subject) {
  return subject.task !== undefined || subject.filters !== undefined;
}

function nothingLabel(subject) {
  return hasSelection(subject) ? NOTHING_IN_SELECTION : NOTHING_MEASURED;
}

/** `name=value` for every active generic filter, in the fixed order `report.js` gives
 * them - empty for an unfiltered period, since a header with nothing to add should add
 * nothing. */
function filtersSuffix(filters) {
  if (!filters) return "";
  const parts = Object.entries(filters).map(([name, value]) => `${name}=${value}`);
  return parts.length === 0 ? "" : `    filters: ${parts.join(", ")}`;
}

// What "never known" means differs by filter: `task` and `tool` are checked against
// journals and a declared list, never against a record, so saying "no record" for either
// would claim a check this layer never ran.
const UNKNOWN_REASON = {
  task: "no journal has ever declared it or written into it",
  tool: "it is not one of the tools this build knows",
};

function unknownReason(filter) {
  return UNKNOWN_REASON[filter] ?? `no record has ever named this ${filter}`;
}

/** What a filter matching nothing says, told apart from a period that genuinely holds no
 * work: that case never reaches here, since `report.js` only ever names an
 * `emptySelection` when a filter - not the period itself - is what emptied it. */
function emptySelectionMessage({ filter, value, known, combination }) {
  if (!known) return `  ${filter} '${value}' matched nothing — ${unknownReason(filter)}`;
  if (combination) {
    return `  ${filter} '${value}' matched nothing combined with the rest of this selection`;
  }
  return `  ${filter} '${value}' matched nothing in this selection — known, but no work here`;
}
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
    out(`  ${pad("requests")}${nothingLabel(report)}`);
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

/** Only where `--task` narrowed the report - a session without one carries no per-record
 * task identity to break down (see metrics-contract.md), so there is nothing here to print
 * for the unfiltered period. */
function printTaskAttribution(out, report, basis) {
  if (report.taskAttributionMix === undefined) return;
  out("");
  out(`  ticket known    ${basis.label}`);
  for (const row of report.taskAttributionMix) {
    out(`    ${pad(TASK_ATTRIBUTION_LABELS[row.attribution])}${share(row.totals, basis)}`);
  }
}

function printModels(out, report, basis) {
  if (report.byModels.length === 0) return;
  out("");
  out(`  by model    ${basis.label}`);
  for (const row of report.byModels) {
    const name = row.model ?? NO_KNOWN_MODEL;
    out(`    ${pad(name)}${share(row.totals, basis)}   ${figure(row.totals, basis)}`);
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
      out(`    ${pad(row.day)}${nothingLabel(report)}`);
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
    } else if (row.totals.requests === 0 && row.sessionTotals) {
      const tokens = `${count(tokensOf(row.sessionTotals))} tokens (${SESSION_TOTAL_LABEL})`;
      out(`    ${pad(name)}${tokens}${because}`);
    } else if (row.totals.requests === 0) {
      out(`    ${pad(name)}${nothingLabel(report)}${because}`);
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
  const scope = report.task === undefined ? "period" : `task ${report.task}`;
  out(`${scope}    ${report.fromDay} to ${report.toDay}${filtersSuffix(report.filters)}`);
  out("");
  if (report.emptySelection !== undefined) {
    out(emptySelectionMessage(report.emptySelection));
    out("");
  }
  printTotals(out, report);
  // A filter-emptied selection has nothing under any breakdown to show - every row would
  // read "nothing in this period", which is exactly the false zero this layer refuses.
  if (report.emptySelection === undefined) {
    const basis = basisOf(report.totals);
    printTaskAttribution(out, report, basis);
    printSteps(out, report, basis);
    printModels(out, report, basis);
    printProjects(out, report, basis);
    printTools(out, report);
    printDays(out, report);
  }
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

/** `undefined` when the selection matched something, or matched nothing only because the
 * period itself held none - the same case `toEnvelope` never adds this field for. */
function envelopeEmptySelection(emptySelection) {
  if (emptySelection === undefined) return undefined;
  const { filter, value, known, combination } = emptySelection;
  return { filter, value, known, ...(combination ? { combination: true } : {}) };
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
    ...(report.filters === undefined ? {} : { filters: report.filters }),
    ...(report.emptySelection === undefined
      ? {}
      : { empty_selection: envelopeEmptySelection(report.emptySelection) }),
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
      ...(row.model === undefined ? {} : { model: row.model }),
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
      ...(row.sessionTotals === undefined
        ? {}
        : { session_totals: envelopeTotals(row.sessionTotals) }),
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
    // Present only alongside `task`: an unfiltered period carries no per-record task
    // identity to break down (see metrics-contract.md's "Attributing records to a task").
    ...(report.taskAttributionMix === undefined
      ? {}
      : {
          task_attribution: report.taskAttributionMix.map((row) => ({
            attribution: row.attribution,
            totals: envelopeTotals(row.totals),
          })),
        }),
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

function artefactFigure(totals, envelope) {
  if (totals.requests === 0) return nothingLabel(envelope);
  const cost = totals.cost_micro_usd === undefined ? UNKNOWN_AMOUNT : amount(totals.cost_micro_usd);
  return `${cost} — ${count(envelopeTokens(totals))} tokens, ${count(totals.requests)} requests`;
}

/** States the period and the axis on every artefact, so a figure copied out of the session
 * that made it can still be placed - the same reason a chart names its own axes. */
function artefactFilters(filters) {
  if (!filters) return "";
  return `, filters: ${Object.entries(filters)
    .map(([name, value]) => `${name}=${value}`)
    .join(", ")}`;
}

/** States the selection an artefact answered, the same reason it states its period and
 * axis: a figure copied out has to be placeable without the command that made it. */
function artefactHeader(envelope, axisLabel) {
  const { from_day, to_day } = envelope.period;
  const task = envelope.task === undefined ? "" : `, task ${envelope.task}`;
  return `period ${from_day} to ${to_day}${task}${artefactFilters(envelope.filters)} — axis: ${axisLabel}`;
}

function artefactCaveats(envelope) {
  const lines = [];
  if (envelope.empty_selection !== undefined) lines.push(emptySelectionMessage(envelope.empty_selection).trim());
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
  return [artefactHeader(envelope, "total"), "", artefactFigure(envelope.totals, envelope), ...artefactCaveats(envelope)].join(
    "\n"
  );
}

/** A series, one row per day, in order - every day the period spans, gap included, and
 * never capped the way the terminal rendering caps at `MAX_PRINTED_DAYS`: a file is where a
 * long series belongs, and dropping rows there would be the same false continuity that cap
 * exists to prevent in a terminal. The answer to "what changed". */
function dayArtefact(envelope) {
  const rows = envelope.by_day.map((row) => `| ${row.day} | ${artefactFigure(row.totals, envelope)} |`);
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
  const rows = envelope[`by_${axis}`].map((row) => `| ${nameOf(row)} | ${artefactFigure(row.totals, envelope)} |`);
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
const modelArtefact = (envelope) =>
  breakdownArtefact(envelope, "model", "Model", (row) => row.model ?? NO_KNOWN_MODEL);
const projectArtefact = (envelope) =>
  breakdownArtefact(envelope, "project", "Project", (row) => row.project ?? NO_KNOWN_PROJECT);

/** A tool that cannot be read at all is never a zero: its row says so instead of printing a
 * figure nothing measured. A tool with only a `session_totals` figure prints that instead
 * of `nothing in this period` - present because it was measured, absent from `totals`
 * because it is not a sum of requests. */
function toolArtefact(envelope) {
  const rows = envelope.by_tool.map((row) => {
    const because = row.reason ? ` — ${row.reason}` : "";
    let value;
    if (row.coverage === "not-covered") {
      value = `not covered${because}`;
    } else if (row.totals.requests === 0 && row.session_totals) {
      value = `${count(envelopeTokens(row.session_totals))} tokens (${SESSION_TOTAL_LABEL})${because}`;
    } else {
      value = `${artefactFigure(row.totals, envelope)}${because}`;
    }
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

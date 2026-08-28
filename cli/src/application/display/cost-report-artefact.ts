import type {
  CostReportEmptySelection,
  CostReportFilterName,
  CostReportFilters,
} from "../../domain/models/cost-report.js";
import { fromMicroUsd } from "../../domain/models/cost-report.js";
import type {
  CostReportEnvelope,
  CostReportEnvelopePersonRow,
  CostReportEnvelopeTotals,
} from "../../domain/models/cost-report-envelope.js";
import { getAiToolConfig } from "../../domain/tools/registry.js";
import { ATTRIBUTION_LABELS } from "./cost-report-display.js";

/**
 * One axis of a report, rendered as something a person pastes elsewhere.
 *
 * Distinct from `cost-report-display.ts`, which prints every axis at once for a terminal.
 * This prints one axis, as a markdown table, and drops the share and attribution columns
 * the inline reading adds: a table meant to leave the session that made it carries the
 * figures, not a computed percentage of them.
 *
 * It reads the envelope rather than the domain report, because the envelope is what a
 * consumer already parses, and because that is the shape the plugin script this replaces
 * rendered from — which is how the two were pinned byte-for-byte before the script went.
 */
export const ARTEFACT_AXES = [
  "total",
  "day",
  "step",
  "model",
  "tool",
  "project",
  "person",
] as const;

export type ArtefactAxis = (typeof ARTEFACT_AXES)[number];

const UNKNOWN_AMOUNT = "amount unknown";
const NOTHING_MEASURED = "nothing in this period";
const NOTHING_IN_SELECTION = "nothing in this selection";
const SESSION_TOTAL_LABEL = "session total, not requests";
const NO_KNOWN_PROJECT = "no known project";
const NO_KNOWN_MODEL = "no known model";
// Distinct on purpose, per the contract's own three-way shape: an unresolved row names an
// identity that is real but unplaced, and repeats once per such identity since each is its
// own row; the no-identity row is singular and says nobody opted in at all. Neither label
// may be swapped for the other, and neither reads as a shared bucket.
const NO_PERSON_IDENTIFIER = "no identity — nobody opted in";
function unresolvedPersonLabel(identity: string): string {
  return `unresolved — not mapped to anyone (${identity})`;
}

const UNKNOWN_REASON: Partial<Record<CostReportFilterName, string>> = {
  task: "no journal has ever declared it or written into it",
  tool: "it is not one of the tools this build knows",
};

function count(value: number): string {
  return value.toLocaleString("en-US");
}

function amount(microUsd: number): string {
  return `$${fromMicroUsd(microUsd).toFixed(2)}`;
}

/** The four counters are disjoint on every reader here, so adding them counts nothing twice. */
function envelopeTokens(totals: CostReportEnvelopeTotals): number {
  return (
    (totals.input_tokens ?? 0) +
    (totals.output_tokens ?? 0) +
    (totals.cache_read_tokens ?? 0) +
    (totals.cache_creation_tokens ?? 0)
  );
}

function hasSelection(envelope: CostReportEnvelope): boolean {
  return envelope.task !== undefined || envelope.filters !== undefined;
}

function nothingLabel(envelope: CostReportEnvelope): string {
  return hasSelection(envelope) ? NOTHING_IN_SELECTION : NOTHING_MEASURED;
}

function figure(totals: CostReportEnvelopeTotals, envelope: CostReportEnvelope): string {
  if (totals.requests === 0) return nothingLabel(envelope);
  const cost = totals.cost_micro_usd === undefined ? UNKNOWN_AMOUNT : amount(totals.cost_micro_usd);
  return `${cost} — ${count(envelopeTokens(totals))} tokens, ${count(totals.requests)} requests`;
}

function filtersSuffix(filters: CostReportFilters | undefined): string {
  if (!filters) return "";
  const parts = Object.entries(filters).map(([name, value]) => `${name}=${value}`);
  return parts.length === 0 ? "" : `, filters: ${parts.join(", ")}`;
}

/** States the period, the selection and the axis on every artefact, for the same reason a
 * chart names its own axes: a figure copied out of the session that made it has to stay
 * placeable without the command that produced it. */
// Carried on every axis's own header, never only on the terminal rendering: a table meant
// to leave the session that made it must say this on its own, the same reason the
// attribution column exists beside it. See cost-report-display.ts's printHeader for why
// the wording never says "measurement is off" bare — the sink below is scoped to this
// person, not to this project, so an off switch never contradicts a real figure beside it.
function measurementSuffix(envelope: CostReportEnvelope): string {
  return envelope.measurement_enabled
    ? ""
    : " — this project's switch is off, figures are the whole sink, not scoped to it";
}

function header(envelope: CostReportEnvelope, axisLabel: string): string {
  const { from_day, to_day } = envelope.period;
  const task = envelope.task === undefined ? "" : `, task ${envelope.task}`;
  return (
    `period ${from_day} to ${to_day}${task}${filtersSuffix(envelope.filters)} — axis: ${axisLabel}` +
    measurementSuffix(envelope)
  );
}

function unknownReason(filter: CostReportFilterName): string {
  return UNKNOWN_REASON[filter] ?? `no record has ever named this ${filter}`;
}

function emptySelectionMessage({
  filter,
  value,
  known,
  combination,
}: CostReportEmptySelection): string {
  if (!known) return `${filter} '${value}' matched nothing — ${unknownReason(filter)}`;
  if (combination)
    return `${filter} '${value}' matched nothing combined with the rest of this selection`;
  return `${filter} '${value}' matched nothing in this selection — known, but no work here`;
}

/** What the read could not do travels with what it did, on the artefact as on the terminal:
 * a total assembled from a partial read is indistinguishable from a complete one without it.
 *
 * `identity_unusable === "absent"` is the exception: it is every user's ordinary default
 * state, not a degraded read, so it is never printed as a caveat here. Only the person axis
 * (`personArtefact`, via `includeAbsentIdentityCaveat: true`) says it, because that is the
 * one place the reader is already looking at identity resolution and the fact is relevant.
 * `"unreadable"` is real damage on every axis and always prints. */
function caveats(
  envelope: CostReportEnvelope,
  { includeAbsentIdentityCaveat = false }: { includeAbsentIdentityCaveat?: boolean } = {}
): readonly string[] {
  const lines: string[] = [];
  if (envelope.empty_selection !== undefined) {
    lines.push(emptySelectionMessage(envelope.empty_selection));
  }
  if (envelope.read.undated_records > 0) {
    lines.push(
      `${count(envelope.read.undated_records)} records carry no moment and are in no period`
    );
  }
  if (envelope.read.unreadable_lines > 0) {
    lines.push(`${count(envelope.read.unreadable_lines)} lines could not be read`);
  }
  if (envelope.read.identity_unusable === "unreadable") {
    lines.push(
      "this machine's own identity could not be read; every identifier is reported unresolved"
    );
  } else if (envelope.read.identity_unusable === "absent" && includeAbsentIdentityCaveat) {
    lines.push("no identity was declared; every identifier is reported unresolved");
  }
  return lines;
}

function table(
  envelope: CostReportEnvelope,
  axisLabel: string,
  column: string,
  rows: readonly string[]
): string {
  return [
    header(envelope, axisLabel),
    "",
    `| ${column} | Total |`,
    "| --- | --- |",
    ...rows,
    ...caveats(envelope),
  ].join("\n");
}

/** One total, in a line: the answer to "what did this cost". */
function totalArtefact(envelope: CostReportEnvelope): string {
  return [
    header(envelope, "total"),
    "",
    figure(envelope.totals, envelope),
    ...caveats(envelope),
  ].join("\n");
}

/** Every day the period spans, gap included, and never capped the way the terminal rendering
 * caps a long series: a file is where a long series belongs, and dropping rows there would be
 * the same false continuity the cap exists to prevent in a terminal. */
function dayArtefact(envelope: CostReportEnvelope): string {
  return table(
    envelope,
    "by day",
    "Day",
    envelope.by_day.map((row) => `| ${row.day} | ${figure(row.totals, envelope)} |`)
  );
}

/** Two rows can share one step name — the same skill reached once from the tool's own
 * statement and once from a journal interval is two different claims about the same step,
 * never one the report is free to merge (`by_step` is keyed on `step` and `attribution`
 * together; see `cost-report-contract.md`). Dropping the attribution column here would
 * paste a table where two such rows are indistinguishable from one step double-counted -
 * so unlike every other axis below, this one carries a third column rather than the
 * generic `table()` helper's two. */
function stepArtefact(envelope: CostReportEnvelope): string {
  const rows = envelope.by_step.map((row) => {
    const step = row.step ?? "unattributed";
    return `| ${step} | ${ATTRIBUTION_LABELS[row.attribution]} | ${figure(row.totals, envelope)} |`;
  });
  return [
    header(envelope, "by step"),
    "",
    "| Step | Attribution | Total |",
    "| --- | --- | --- |",
    ...rows,
    ...caveats(envelope),
  ].join("\n");
}

function modelArtefact(envelope: CostReportEnvelope): string {
  return table(
    envelope,
    "by model",
    "Model",
    envelope.by_model.map(
      (row) => `| ${row.model ?? NO_KNOWN_MODEL} | ${figure(row.totals, envelope)} |`
    )
  );
}

/** A mapped row's own label: its display name when one was set, its canonical identifier
 * otherwise — never a raw identity, since a mapped row may carry several. */
function mappedPersonLabel(row: CostReportEnvelopePersonRow): string {
  return row.display_name ?? row.person ?? "";
}

function personLabel(row: CostReportEnvelopePersonRow): string {
  if (row.resolution === "mapped") return mappedPersonLabel(row);
  if (row.resolution === "unresolved") return unresolvedPersonLabel(row.identities[0] ?? "");
  return NO_PERSON_IDENTIFIER;
}

/** A third column beside every other axis's two, because a person line the contract can
 * audit has to carry its own evidence: the raw identities behind it, not only its label. */
function personArtefact(envelope: CostReportEnvelope): string {
  const rows = envelope.by_person.map((row) => {
    const identities = row.identities.length > 0 ? row.identities.join(", ") : "—";
    return `| ${personLabel(row)} | ${identities} | ${figure(row.totals, envelope)} |`;
  });
  return [
    header(envelope, "by person"),
    "",
    "| Person | Identities | Total |",
    "| --- | --- | --- |",
    ...rows,
    ...caveats(envelope, { includeAbsentIdentityCaveat: true }),
  ].join("\n");
}

function projectArtefact(envelope: CostReportEnvelope): string {
  return table(
    envelope,
    "by project",
    "Project",
    envelope.by_project.map(
      (row) => `| ${row.project ?? NO_KNOWN_PROJECT} | ${figure(row.totals, envelope)} |`
    )
  );
}

/** A tool that cannot be read at all is never a zero: its row says so instead of printing a
 * figure nothing measured. A tool carrying only a session total prints that rather than
 * "nothing in this period" — present because it was measured, absent from `totals` because it
 * is not a sum of requests. */
function toolArtefact(envelope: CostReportEnvelope): string {
  const rows = envelope.by_tool.map((row) => {
    const because = row.reason ? ` — ${row.reason}` : "";
    let value: string;
    if (row.coverage === "not-covered") {
      value = `not covered${because}`;
    } else if (row.totals.requests === 0 && row.session_totals) {
      value = `${count(envelopeTokens(row.session_totals))} tokens (${SESSION_TOTAL_LABEL})${because}`;
    } else {
      value = `${figure(row.totals, envelope)}${because}`;
    }
    return `| ${getAiToolConfig(row.tool).displayName} | ${value} |`;
  });
  return table(envelope, "by tool", "Tool", rows);
}

const BUILDERS: Record<ArtefactAxis, (envelope: CostReportEnvelope) => string> = {
  total: totalArtefact,
  day: dayArtefact,
  step: stepArtefact,
  model: modelArtefact,
  tool: toolArtefact,
  project: projectArtefact,
  person: personArtefact,
};

export function isArtefactAxis(value: string): value is ArtefactAxis {
  return (ARTEFACT_AXES as readonly string[]).includes(value);
}

/** An axis name in, the artefact that answers it out. An axis this does not know is refused
 * by name, with the ones it does — never guessed at. */
export function buildCostReportArtefact(envelope: CostReportEnvelope, axis: string): string {
  if (!isArtefactAxis(axis)) {
    throw new Error(`Unknown axis '${axis}'. Expected one of: ${ARTEFACT_AXES.join(", ")}.`);
  }
  return BUILDERS[axis](envelope);
}

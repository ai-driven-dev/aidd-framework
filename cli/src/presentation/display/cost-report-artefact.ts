import type {
  CostReportEmptySelection,
  CostReportFilterName,
  CostReportFilters,
} from "../../contexts/telemetry/domain/cost-report.js";
import { fromMicroUsd } from "../../contexts/telemetry/domain/cost-report.js";
import type {
  CostReportEnvelope,
  CostReportEnvelopePersonRow,
  CostReportEnvelopeTotals,
} from "../../contexts/telemetry/domain/cost-report-envelope.js";
import { bareOrchestratingSkillNames } from "../../contexts/telemetry/domain/flow-attribution.js";
import type { PersonResolution } from "../../contexts/telemetry/domain/person-resolution.js";
import { getAiToolConfig } from "../../contexts/tools/domain/registry.js";
import {
  ATTRIBUTION_LABELS,
  BACKLOG_DECLARATION_LABELS,
  TASK_ATTRIBUTION_LABELS,
  TASK_UNATTRIBUTED_LABELS,
} from "./cost-report-display.js";

/** One axis, as a markdown table a person pastes elsewhere: it drops the share column the
 * terminal rendering adds, since a table leaving the session that made it carries figures and
 * not a percentage of them. It reads the envelope, the shape a consumer already parses. */
export const ARTEFACT_AXES = [
  "total",
  "day",
  "step",
  "model",
  "agent",
  "prompt",
  "task",
  "backlog",
  "flow",
  "tool",
  "project",
  "person",
] as const;

export type ArtefactAxis = (typeof ARTEFACT_AXES)[number];

const NO_PROMPT_LABEL = "no prompt named";
const UNKNOWN_AMOUNT = "amount unknown";
const NOTHING_MEASURED = "nothing in this period";
const NOTHING_IN_SELECTION = "nothing in this selection";
const SESSION_TOTAL_LABEL = "session total, not requests";
const NO_KNOWN_PROJECT = "no known project";
const NO_KNOWN_MODEL = "no known model";
// Not "no agent": the main thread is where a session starts, not an absence.
const MAIN_THREAD = "the main thread";
// A tool that names no agent has said nothing about which one ran, so calling that row "the
// main thread" would state a fact nothing observed.
const AGENT_NOT_STATED = "the tool names no agent";
// Distinct on purpose: an unresolved row names a real but unplaced identity and repeats once
// per identity, while the no-identity row is singular. Neither is a shared bucket.
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

/** Carried on every axis's own header, so a figure copied out of the session that made it
 * stays placeable without the command that produced it. Never worded "measurement is off"
 * bare: the sink is scoped to this person, not this project, so an off switch contradicts no
 * figure beside it. */
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

/** What the read could not do travels with what it did: a total assembled from a partial read
 * is otherwise indistinguishable from a complete one. `identity_unusable === "absent"` is the
 * ordinary default rather than damage, so only the person axis states it. */
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

/** Every day the period spans, gaps included and never capped the way a terminal caps a long
 * series: dropping rows in a file is the false continuity the cap exists to prevent. */
function dayArtefact(envelope: CostReportEnvelope): string {
  return table(
    envelope,
    "by day",
    "Day",
    envelope.by_day.map((row) => `| ${row.day} | ${figure(row.totals, envelope)} |`)
  );
}

/** Two rows can share one step name — the same skill reached from a tool's own statement and
 * from a journal interval is two claims, never one — so this axis carries a third column:
 * without it the pair is indistinguishable from one step double-counted. */
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

/** A third column for the same reason `stepArtefact` carries one: a named task's row rests on
 * a closed interval and the table must say so. A row for what fell in no declared interval
 * carries no attribution, only its reason. */
function taskArtefact(envelope: CostReportEnvelope): string {
  const rows = envelope.by_task.map((row) => {
    const task = row.task ?? (row.reason === undefined ? "" : TASK_UNATTRIBUTED_LABELS[row.reason]);
    const strength = row.attribution === undefined ? "—" : TASK_ATTRIBUTION_LABELS[row.attribution];
    return `| ${task} | ${strength} | ${figure(row.totals, envelope)} |`;
  });
  return [
    header(envelope, "by task"),
    "",
    "| Task | Attribution | Total |",
    "| --- | --- | --- |",
    ...rows,
    ...caveats(envelope),
  ].join("\n");
}

/** No third column, unlike `taskArtefact`: every named backlog row rests on the same single
 * route, so there is no second strength to distinguish. */
function backlogArtefact(envelope: CostReportEnvelope): string {
  const rows = envelope.by_backlog.map((row) => {
    const name =
      row.backlog ??
      (row.declaration !== undefined
        ? BACKLOG_DECLARATION_LABELS[row.declaration]
        : row.reason !== undefined
          ? TASK_UNATTRIBUTED_LABELS[row.reason]
          : "");
    return `| ${name} | ${figure(row.totals, envelope)} |`;
  });
  return table(envelope, "by backlog", "Backlog item", rows);
}

const OUTSIDE_EVERY_FLOW_LABEL = "outside any flow";

/** Standing properties of how a flow is read, never a damaged read the way `caveats()`'s lines
 * are, which is why they are assembled apart. Each set is gated on a row it describes: a limit
 * about a mechanism that never ran is noise. */
function flowLimits(envelope: CostReportEnvelope): readonly string[] {
  return [...journalFlowLimits(envelope), ...toolStatedFlowLimits(envelope)];
}

/** Both properties of walking the journal's own step sequence, so both are gated on a row
 * that walk produced. */
function journalFlowLimits(envelope: CostReportEnvelope): readonly string[] {
  if (!envelope.by_flow.some((row) => row.attribution === "journal-interval")) return [];
  return [
    "a skill run by hand while a flow was open is counted inside it: the orchestrator's own " +
      "call and a person's write the identical step_start line",
    `a skill of this project named ${orAny(bareOrchestratingSkillNames())} opens a flow of ` +
      "its own: outside a plugin a host names a skill by its folder alone, and this axis " +
      "has only that name to go on",
  ];
}

/** A flow no interval bounded is a name, and a name cannot say how many runs it stands for:
 * a reader taking it for one run reads its total as one orchestration's cost. */
function toolStatedFlowLimits(envelope: CostReportEnvelope): readonly string[] {
  if (!envelope.by_flow.some((row) => row.attribution === "tool-stated")) return [];
  return [
    "a flow only a record's own tool named is every run of that skill at once: its journal " +
      "opened no flow to bound one run from the next, so the row has no opening moment and " +
      "its total is not one orchestration's",
  ];
}

/** `a`, `a or b`, `a, b or c`: however many names there are, the sentence stays grammatical. */
function orAny(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** Two extra columns, for the same reason `stepArtefact` carries one: two rows can share a
 * `flow` name, and `Attribution` plus `Opened at` are what keep them from reading as one flow
 * double-counted. A `tool-stated` row is a bucket with no single opening moment, so it prints
 * an em dash there, as does work outside every flow. */
function flowArtefact(envelope: CostReportEnvelope): string {
  const rows = envelope.by_flow.map((row) => {
    const flow = row.flow ?? OUTSIDE_EVERY_FLOW_LABEL;
    const openedAt = row.started_at ?? "—";
    const attribution = ATTRIBUTION_LABELS[row.attribution];
    return `| ${flow} | ${attribution} | ${openedAt} | ${figure(row.totals, envelope)} |`;
  });
  return [
    header(envelope, "by flow"),
    "",
    "| Flow | Attribution | Opened at | Total |",
    "| --- | --- | --- | --- |",
    ...rows,
    ...flowLimits(envelope),
    ...caveats(envelope),
  ].join("\n");
}

function agentArtefact(envelope: CostReportEnvelope): string {
  return table(
    envelope,
    "by agent",
    "Agent",
    envelope.by_agent.map(
      (row) =>
        `| ${row.agent ?? (row.attribution === "main-thread" ? MAIN_THREAD : AGENT_NOT_STATED)} | ${figure(row.totals, envelope)} |`
    )
  );
}

/** The id alone is opaque; the moment its turn began is what a person greps for in their own
 * transcript. `—` where a row carries none, never a moment borrowed from another turn. */
function promptArtefact(envelope: CostReportEnvelope): string {
  const rows = envelope.by_prompt.map(
    (row) =>
      `| ${row.prompt ?? NO_PROMPT_LABEL} | ${row.started_at ?? "—"} | ${figure(row.totals, envelope)} |`
  );
  return [
    header(envelope, "by prompt"),
    "",
    "| Prompt | Started at | Total |",
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

/** A `Record` rather than an if-chain with a fallback, so a value added to `PersonResolution`
 * fails to compile here instead of reaching a reader as "nobody opted in". */
const PERSON_LABELS: Record<PersonResolution, (row: CostReportEnvelopePersonRow) => string> = {
  mapped: mappedPersonLabel,
  // The same label a mapped row gets: it is the same person, and `resolution` already carries
  // how it was reached.
  "this-machine": mappedPersonLabel,
  unresolved: (row) => unresolvedPersonLabel(row.identities[0] ?? ""),
  none: () => NO_PERSON_IDENTIFIER,
};

function personLabel(row: CostReportEnvelopePersonRow): string {
  return PERSON_LABELS[row.resolution](row);
}

/** A third column, because an auditable person line carries its own evidence: the raw
 * identities behind it, not only its label. */
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

/** A tool that cannot be read is never a zero. One carrying only a session total prints that
 * rather than "nothing in this period": measured, but not a sum of requests. */
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
  agent: agentArtefact,
  prompt: promptArtefact,
  task: taskArtefact,
  backlog: backlogArtefact,
  flow: flowArtefact,
  tool: toolArtefact,
  project: projectArtefact,
  person: personArtefact,
};

export function isArtefactAxis(value: string): value is ArtefactAxis {
  return (ARTEFACT_AXES as readonly string[]).includes(value);
}

/** An unknown axis is refused by name, with the ones this knows, never guessed at. */
export function buildCostReportArtefact(envelope: CostReportEnvelope, axis: string): string {
  if (!isArtefactAxis(axis)) {
    throw new Error(`Unknown axis '${axis}'. Expected one of: ${ARTEFACT_AXES.join(", ")}.`);
  }
  return BUILDERS[axis](envelope);
}

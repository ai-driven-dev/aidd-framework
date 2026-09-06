/** The four axes keyed on a value the record itself states directly - project, model,
 * agent and prompt - each with its own sentinel for what named none. */

import type { AiToolId } from "../../../../../kernel/tool.js";
import type {
  CostReportAgentRow,
  CostReportModelRow,
  CostReportProjectRow,
  CostReportPromptRow,
  CostReportToolDeclaration,
  TotalsAccumulator,
} from "../../cost-report.js";
import type { TelemetrySinkRecord } from "../../telemetry-sink-record.js";
import { bySize, isoSecondsFromMs } from "../row-ordering.js";

// A record with no project is its own group, never folded into one that was actually
// placed. A symbol can never equal a real `project_id` string, so it is a safe Map key
// for "unknown" beside every value a record might actually carry.
const NO_KNOWN_PROJECT = Symbol("no known project");
export type ProjectKey = string | typeof NO_KNOWN_PROJECT;

// An empty string is not a name - it is what a tool writes when it has none to give, and
// treating it as its own project would print a nameless row a person cannot act on. The
// `typeof` guard is there for a second reason: a record read off disk carries whatever its
// own line actually held, not what this field's type declares.
export function projectKeyOf(record: TelemetrySinkRecord): ProjectKey {
  return typeof record.project_id === "string" && record.project_id !== ""
    ? record.project_id
    : NO_KNOWN_PROJECT;
}

// The same idea, one dimension over: a record with no model is its own group, never
// dropped. `bySteps` has `unattributed` and `byProjects` has the row above for exactly this
// reason - both the Codex and OpenCode readers permit a request record with no model, so
// without this row `byModels` would stop reconciling to its own total with nothing naming
// the gap. Deliberately narrower than `projectKeyOf`: nothing measured so far ever writes
// an empty-string `model`, so unlike `project_id` this stays an `undefined` check rather
// than also folding in `""` - a rule this module has no evidence for yet.
const NO_KNOWN_MODEL = Symbol("no known model");
export type ModelKey = string | typeof NO_KNOWN_MODEL;

// The main thread's own row, and the row for a tool that could never have named one. Symbols
// for the same reason `NO_KNOWN_MODEL` is one: an agent really can be named anything, so no
// string is safe to reserve.
const MAIN_THREAD = Symbol("the main thread");
const AGENT_NOT_STATED = Symbol("a tool whose route never names an agent");
export type AgentKey = string | typeof MAIN_THREAD | typeof AGENT_NOT_STATED;

/** Which of the three rows a record joins. `agent_name` present is the tool's own statement
 * and needs nothing else; absent means one of two different things, and only the tool's
 * declaration tells them apart.
 *
 * This axis used to answer `NO_AGENT` for every record with no `agent_name`, whatever the
 * tool. Only Claude Code's reader ever sets the field, so on Codex, Copilot and OpenCode
 * every record was reported as the main thread — 100% of the axis, on no evidence. The
 * declaration is read rather than the record because the record cannot carry the absence:
 * a tool that never names an agent writes exactly what a main-thread line writes. */
export function agentKeyOf(
  record: TelemetrySinkRecord,
  namesAgents: (tool: AiToolId) => boolean
): AgentKey {
  if (record.agent_name !== undefined) return record.agent_name;
  return namesAgents(record.tool) ? MAIN_THREAD : AGENT_NOT_STATED;
}

/** Whether a tool's own declared route names agents, answered from `declaredTools` alone.
 * A tool with no declared local read supplies nothing, so it names no agent either — the
 * same reading `NO_CAPABILITY` gives every other supply. */
export function agentNamingTools(
  declaredTools: readonly CostReportToolDeclaration[]
): (tool: AiToolId) => boolean {
  const naming = new Set(
    declaredTools
      .filter((declaration) => declaration.capability.localRead?.agentName === true)
      .map((declaration) => declaration.tool)
  );
  return (tool) => naming.has(tool);
}

// The row for what named no prompt. A symbol for the same reason `NO_AGENT` is one: a prompt
// id is opaque and host-assigned, so no string is safe to reserve against it.
const NO_PROMPT = Symbol("no prompt named");
export type PromptKey = string | typeof NO_PROMPT;

export function promptKeyOf(record: TelemetrySinkRecord): PromptKey {
  return record.prompt_id === undefined ? NO_PROMPT : record.prompt_id;
}

export function modelKeyOf(record: TelemetrySinkRecord): ModelKey {
  return record.model === undefined ? NO_KNOWN_MODEL : record.model;
}

/** A prompt's running totals plus the earliest moment seen in it. The moment is tracked
 * here rather than read back off the records because the pass over them happens once, and
 * because a sink is append-ordered by when it was read, never by when a turn began. */
export interface PromptGroup {
  readonly totals: TotalsAccumulator;
  earliestMs?: number;
}

/** Every project a record named, largest first, plus one row for what named none. */
export function projectRows(
  projects: ReadonlyMap<ProjectKey, TotalsAccumulator>
): readonly CostReportProjectRow[] {
  const rows: CostReportProjectRow[] = [...projects].map(([key, accumulator]) => ({
    ...(key === NO_KNOWN_PROJECT ? {} : { project: key }),
    totals: accumulator.build(),
  }));
  return bySize(
    rows,
    (row) => row.totals,
    (row) => row.project ?? ""
  );
}

/** Every agent that ran, largest first, plus one row for the main thread. */
export function agentRows(
  agents: ReadonlyMap<AgentKey, TotalsAccumulator>
): readonly CostReportAgentRow[] {
  const rows: CostReportAgentRow[] = [...agents].map(([key, accumulator]) => {
    if (key === MAIN_THREAD) return { attribution: "main-thread", totals: accumulator.build() };
    if (key === AGENT_NOT_STATED) return { attribution: "not-stated", totals: accumulator.build() };
    return { agent: key, attribution: "tool-stated", totals: accumulator.build() };
  });
  return bySize(
    rows,
    (row) => row.totals,
    (row) => `${row.agent ?? ""}@${row.attribution}`
  );
}

/** Every prompt that caused work, largest first, plus one row for what named none.
 * Largest first and not chronological: unlike `by_day` this is a ranking, and a ranking has
 * no continuity to break by reordering. The row for what named none is placed last rather
 * than ranked among them - it is a remainder drawn from many turns, not a turn, so its size
 * is not comparable to theirs. `by_flow` places its own remainder the same way. */
export function promptRows(
  prompts: ReadonlyMap<PromptKey, PromptGroup>
): readonly CostReportPromptRow[] {
  const named: CostReportPromptRow[] = [];
  let namedNone: CostReportPromptRow | undefined;
  for (const [key, group] of prompts) {
    const totals = group.totals.build();
    if (key === NO_PROMPT) {
      namedNone = { totals };
      continue;
    }
    named.push({
      prompt: key,
      ...(group.earliestMs === undefined ? {} : { startedAt: isoSecondsFromMs(group.earliestMs) }),
      totals,
    });
  }
  const sorted = bySize(
    named,
    (row) => row.totals,
    (row) => row.prompt ?? ""
  );
  return namedNone === undefined ? sorted : [...sorted, namedNone];
}

/** Every model a record named, largest first, plus one row for what named none. */
export function modelRows(
  models: ReadonlyMap<ModelKey, TotalsAccumulator>
): readonly CostReportModelRow[] {
  const rows: CostReportModelRow[] = [...models].map(([key, accumulator]) => ({
    ...(key === NO_KNOWN_MODEL ? {} : { model: key }),
    totals: accumulator.build(),
  }));
  return bySize(
    rows,
    (row) => row.totals,
    (row) => row.model ?? ""
  );
}

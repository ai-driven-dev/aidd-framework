/** Narrows a period's records to what a `--task` and a set of generic filters both admit,
 * one composing stage at a time, and says which filter emptied the selection when one did. */

import type {
  CostReportEmptySelection,
  CostReportFilterName,
  CostReportFilters,
  CostReportInput,
  CostReportSessionJournal,
} from "../cost-report.js";
import { momentFallsWithin } from "../journal-intervals.js";
import type { TaskAttributionSource, TaskInterval } from "../task-attribution.js";
import {
  type TaskIdentity,
  taskIdentitiesFromWrittenPaths,
  taskIdentityFromWrittenPath,
} from "../task-identity.js";
import type { TelemetrySinkRecord } from "../telemetry-sink-record.js";

/** The vendor ids whose sessions wrote into `task` at some point - deliberately
 * whole-session, unlike the per-record precision a declared interval gives. */
function inferredVendorIdsForTask(
  journals: readonly CostReportSessionJournal[],
  task: TaskIdentity
): ReadonlySet<string> {
  const vendorIds = new Set<string>();
  for (const journal of journals) {
    if (taskIdentitiesFromWrittenPaths(journal.writtenPaths).includes(task)) {
      vendorIds.add(journal.vendorId);
    }
  }
  return vendorIds;
}

/** Every session's own declared intervals that name `task`, keyed by vendor id so a record's
 * session is a lookup rather than a walk of every journal again. A session that never declared
 * this task carries no entry, so it reads as belonging to none, never to the last one seen. */
function declaredIntervalsForTask(
  journals: readonly CostReportSessionJournal[],
  task: TaskIdentity
): ReadonlyMap<string, readonly TaskInterval[]> {
  const byVendorId = new Map<string, readonly TaskInterval[]>();
  for (const journal of journals) {
    const intervals = journal.taskIntervals.filter(
      (interval) => taskIdentityFromWrittenPath(interval.path) === task
    );
    if (intervals.length > 0) byVendorId.set(journal.vendorId, intervals);
  }
  return byVendorId;
}

/** Both routes to `task`, kept apart rather than merged into one vendor-id set: a declared
 * interval decides per record, a written file for a session's records as a whole. Merging them
 * would let a zero-width or long-closed declaration - real, but covering no record - drag in
 * records a written file never touched either. */
export interface TaskMembership {
  readonly declaredIntervalsByVendorId: ReadonlyMap<string, readonly TaskInterval[]>;
  readonly inferredVendorIds: ReadonlySet<string>;
}

export function taskMembership(
  journals: readonly CostReportSessionJournal[],
  task: TaskIdentity
): TaskMembership {
  return {
    declaredIntervalsByVendorId: declaredIntervalsForTask(journals, task),
    inferredVendorIds: inferredVendorIdsForTask(journals, task),
  };
}

/** How, if at all, one record belongs to the task `membership` was built for - `undefined` for
 * neither route, which excludes it from a `--task` report entirely. Only a record a
 * declaration does not cover falls back to whether its whole session wrote into the folder. */
export function taskAttributionOf(
  record: TelemetrySinkRecord,
  membership: TaskMembership
): TaskAttributionSource | undefined {
  const intervals = membership.declaredIntervalsByVendorId.get(record.vendor_id);
  if (intervals && momentFallsWithin(intervals, record.event_timestamp)) return "declared";
  return membership.inferredVendorIds.has(record.vendor_id) ? "inferred" : undefined;
}

const GENERIC_FILTER_FIELDS: Readonly<Record<keyof CostReportFilters, keyof TelemetrySinkRecord>> =
  {
    project: "project_id",
    step: "step",
    model: "model",
    tool: "tool",
  };
const GENERIC_FILTER_ORDER: readonly (keyof CostReportFilters)[] = [
  "project",
  "step",
  "model",
  "tool",
];

interface SelectionStage {
  readonly name: CostReportFilterName | undefined;
  readonly value: string | undefined;
  readonly records: readonly TelemetrySinkRecord[];
}

/** One stage per active filter, each narrowing what the stage before it kept. Filters
 * compose by `and` and nothing else: every stage only ever removes records the one before
 * it was already going to keep, never adds one back. */
export function selectionStages(
  records: readonly TelemetrySinkRecord[],
  input: CostReportInput,
  membership: TaskMembership | null
): readonly SelectionStage[] {
  const stages: SelectionStage[] = [{ name: undefined, value: undefined, records }];
  if (membership !== null) {
    const kept = records.filter((r) => taskAttributionOf(r, membership) !== undefined);
    stages.push({ name: "task", value: input.task, records: kept });
  }
  for (const name of GENERIC_FILTER_ORDER) {
    const value = input.filters?.[name];
    if (value === undefined) continue;
    const field = GENERIC_FILTER_FIELDS[name];
    const previous = stages[stages.length - 1]?.records ?? [];
    stages.push({ name, value, records: previous.filter((r) => r[field] === value) });
  }
  return stages;
}

/** Whether a filter's own value is known at all - anywhere this call can see, not only in this
 * selection. `tool` reads the declared list, a closed set; the rest read `knownValues`,
 * gathered across every day file the caller looked at, not only the period's own records. */
function isKnownFilterValue(
  name: CostReportFilterName,
  value: string,
  input: CostReportInput,
  membership: TaskMembership | null
): boolean {
  if (name === "task") {
    return (
      (membership?.declaredIntervalsByVendorId.size ?? 0) > 0 ||
      (membership?.inferredVendorIds.size ?? 0) > 0
    );
  }
  if (name === "tool") return input.declaredTools.some((tool) => tool.tool === value);
  const known = input.knownValues ?? { projects: new Set(), steps: new Set(), models: new Set() };
  const set = { project: known.projects, step: known.steps, model: known.models }[name];
  return set?.has(value) ?? false;
}

/** True when the culprit filter's own value matched something before any generic filter ran,
 * so the emptiness comes from an intersection rather than from this value alone. `task` has no
 * "alone" reading - it is the only route to a task, not one composed equality check. */
function isCombinationCulprit(
  stages: readonly SelectionStage[],
  membership: TaskMembership | null,
  culprit: SelectionStage
): boolean {
  if (culprit.name === undefined || culprit.name === "task") return false;
  const field = GENERIC_FILTER_FIELDS[culprit.name];
  const baseline = stages[membership === null ? 0 : 1]?.records ?? [];
  return baseline.some((r) => r[field] === culprit.value);
}

/** The first filter that narrowed a non-empty selection down to nothing - never the
 * period itself, which is an honest zero rather than a filter's doing. Stages only ever
 * shrink, so the first empty one is the whole answer to "which filter emptied it". */
export function emptySelectionOf(
  stages: readonly SelectionStage[],
  input: CostReportInput,
  membership: TaskMembership | null
): CostReportEmptySelection | undefined {
  if ((stages[0]?.records.length ?? 0) === 0) return undefined;
  const culprit = stages.find((stage) => stage.records.length === 0);
  if (!culprit || culprit.name === undefined || culprit.value === undefined) return undefined;
  const known = isKnownFilterValue(culprit.name, culprit.value, input, membership);
  const combination = isCombinationCulprit(stages, membership, culprit);
  return {
    filter: culprit.name,
    value: culprit.value,
    known,
    ...(combination ? { combination: true } : {}),
  };
}

/** Which of the four generic filters were actually given, in the same fixed order - never
 * `task`, which keeps its own top-level field unchanged. `undefined` when none were, so
 * an unfiltered period carries no empty object. */
export function activeFilters(
  filters: CostReportFilters | undefined
): CostReportFilters | undefined {
  if (!filters) return undefined;
  const given = GENERIC_FILTER_ORDER.filter((name) => filters[name] !== undefined);
  if (given.length === 0) return undefined;
  return Object.fromEntries(given.map((name) => [name, filters[name]]));
}

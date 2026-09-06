/** The task and backlog axes: keyed on the declared interval a record's own moment falls
 * in, falling back to a session's written files, never merging the two attribution routes. */

import type {
  CostReportBacklogRow,
  CostReportSessionJournal,
  CostReportTaskAttributionRow,
  CostReportTaskRow,
  TotalsAccumulator,
} from "../../cost-report.js";
import { momentFallsWithin } from "../../journal-intervals.js";
import {
  TASK_ATTRIBUTION_SOURCES,
  TASK_UNATTRIBUTED_REASONS,
  type TaskAttributionSource,
  type TaskInterval,
  type TaskUnattributedReason,
  taskUnattributedReason,
} from "../../task-attribution.js";
import type { TaskBacklogDeclaration } from "../../task-backlog-link.js";
import {
  type TaskIdentity,
  taskIdentitiesFromWrittenPaths,
  taskIdentityFromWrittenPath,
} from "../../task-identity.js";
import type { TelemetrySinkRecord } from "../../telemetry-sink-record.js";
import { bySize } from "../row-ordering.js";

/** How a record came to belong to a task, or why it belongs to none - the value every task
 * axis keys on, computed once per record. A named membership carries `attribution` beside
 * the identity rather than only the identity, because the same task holds records from both
 * routes: on the session this route was measured against, 1045 records fell inside a
 * declared interval and 27 preceded the first declaration entirely. One row carrying the
 * weaker attribution would state something false about the 1045. */
export interface TaskGroup {
  readonly task?: TaskIdentity;
  readonly attribution?: TaskAttributionSource;
  readonly reason?: TaskUnattributedReason;
  readonly totals: TotalsAccumulator;
}

interface TaskMembershipRow {
  readonly task: TaskIdentity;
  readonly attribution: TaskAttributionSource;
}

export type TaskRow = TaskMembershipRow | TaskUnattributedReason;

const TASK_ROW_SEPARATOR = " ";

/** Mirrors `stepRowKey`, which keys that axis' own `(name x attribution)` pairs the same
 * way, rather than inventing a second way to key a pair. A `TaskIdentity` is always
 * `${month}/${name}` and an attribution is never one, so a named key can never collide with
 * a reason key. */
export function taskRowKeyOf(row: TaskRow): string {
  return typeof row === "string" ? row : `${row.attribution}${TASK_ROW_SEPARATOR}${row.task}`;
}

/** The one task a session's written files name, when they name exactly one.
 *
 * Two written folders infer nothing: two candidates and no reason to choose between them.
 * That refusal is what answers the objection that kept written paths out of this breakdown
 * until now - the `--task` filter's own inferred route attributes a whole session, which can
 * place one session under two task rows at once. Refusing is not a fallback here, it is the
 * bound that makes the route sound. */
function soleWrittenTaskOf(journal: CostReportSessionJournal | undefined): TaskIdentity | null {
  if (journal === undefined) return null;
  const identities = new Set(taskIdentitiesFromWrittenPaths(journal.writtenPaths));
  if (identities.size !== 1) return null;
  const [only] = identities;
  return only ?? null;
}

/** Whether this journal witnessed `momentIso` at all - never an unbounded yes for a journal
 * that carries no readable moment. */
function witnessed(
  journal: CostReportSessionJournal | undefined,
  momentIso: string | undefined
): boolean {
  const span = journal?.witnessed;
  if (span === undefined || momentIso === undefined) return false;
  const momentMs = Date.parse(momentIso);
  if (Number.isNaN(momentMs)) return false;
  return momentMs >= span.fromMs && momentMs <= span.toMs;
}

// The same idea, one level above a task: a task whose folder declares no backlog item, or
// whose declaration exists but could not be read, is its own group - never folded into
// each other, and never folded into a named item. Symbols, the same reason `NO_KNOWN_PROJECT`
// and `NO_KNOWN_MODEL` are: a backlog item is a free-form string on either support (a forge
// reference or a project-relative path), so nothing here can rule out a real item colliding
// with a string sentinel the way a plain string could.
const NO_BACKLOG_DECLARED = Symbol("task declares no backlog item");
const UNREADABLE_BACKLOG_DECLARATION = Symbol("task's backlog declaration could not be read");
export type BacklogRowKey =
  | string
  | typeof NO_BACKLOG_DECLARED
  | typeof UNREADABLE_BACKLOG_DECLARATION
  | TaskUnattributedReason;

/** Every session's own closed intervals, keyed by vendor id - built once from
 * `buildTaskIntervals`'s own output, never a second notion of when a task was running.
 * Unlike `declaredIntervalsForTask`, this keeps every task a session ever declared, not
 * only one: `byTasks` groups by whichever task a record's moment falls in, not by
 * membership in a single task asked for.
 *
 * Every journal gets an entry, including one that declared nothing: the empty list and
 * the absent key are two different facts, and `taskRowOf` reads them as two - see
 * `cost-report-task.unit.test.ts`'s "says no journal was read, rather than that the
 * session declared nothing" and "still says the session declared nothing when its
 * journal was read and held no declaration". */
export function allTaskIntervalsByVendorId(
  journals: readonly CostReportSessionJournal[]
): ReadonlyMap<string, readonly TaskInterval[]> {
  const byVendorId = new Map<string, readonly TaskInterval[]>();
  for (const journal of journals) byVendorId.set(journal.vendorId, journal.taskIntervals);
  return byVendorId;
}

/** Which task a record's own moment falls inside, among *all* of its session's declared
 * intervals - `taskUnattributedReason` for a record whose moment falls in none. Intervals
 * within one session are closed and never overlap (`buildTaskIntervals`), so at most one
 * ever matches - this never has to choose between two.
 *
 * `interval.path` failing to resolve here is unreachable for every interval this codebase's
 * own wiring ever produces, not merely untested: `buildTaskIntervals` already refuses to
 * emit a `TaskInterval` for a declared path `taskIdentityFromWrittenPath` cannot turn into
 * an identity (a literal `..` path segment, say). It is not unreachable in the type this
 * function actually takes - `CostReportSessionJournal.taskIntervals` is a plain input
 * field, so a caller (a test, most concretely) can still hand this a `TaskInterval` literal
 * whose `path` resolves to nothing, which is exactly why the fallback stays rather than
 * being deleted as dead code. Reading such a moment the same as no interval covering it at
 * all is deliberate, not an invented fourth reason: a path this layer cannot turn into an
 * identity names no task a person could act on by name either. */
export function taskRowOf(
  record: TelemetrySinkRecord,
  intervalsByVendorId: ReadonlyMap<string, readonly TaskInterval[]>,
  journalsByVendorId: ReadonlyMap<string, CostReportSessionJournal>
): TaskRow {
  const intervals = intervalsByVendorId.get(record.vendor_id);
  // No entry at all means no journal was read for this session - never that it declared
  // nothing. `allTaskIntervalsByVendorId` gives every journal it read an entry, so the two
  // cases are distinguishable here and nowhere else.
  if (intervals === undefined) return "no-journal";
  const interval = intervals.find((candidate) =>
    momentFallsWithin([candidate], record.event_timestamp)
  );
  const declared = interval && taskIdentityFromWrittenPath(interval.path);
  if (declared) return { task: declared, attribution: "declared" };
  // Only now the weaker route, and only inside what this journal witnessed: a declaration
  // that covers the record always wins, so this never overrides a stated fact with an
  // inferred one.
  const journal = journalsByVendorId.get(record.vendor_id);
  const inferred = soleWrittenTaskOf(journal);
  if (inferred !== null && witnessed(journal, record.event_timestamp)) {
    return { task: inferred, attribution: "inferred" };
  }
  // The journal's own earliest witnessed moment, so a record older than everything this
  // session saw is named for that rather than for declaring late - the distinction 96.2% of
  // a real period turns on. Absent for a journal with no readable moment, which then makes
  // no coverage claim at all.
  return taskUnattributedReason(intervals, record.event_timestamp, journal?.witnessed?.fromMs);
}

/** Which `byBacklog` row a record's own task-row key belongs in - built from
 * `taskRowOf`'s own output, never a second notion of which task a record fell
 * inside. A reason (the record belongs to no task at all) passes straight through
 * unchanged, exactly as `by_task` gives it; a named task looks up its folder's declaration
 * once, in the map `ReportCostUseCase` already resolved for every distinct task identity
 * this period's records could name.
 *
 * A named task missing from `declarations` is unreachable through this module's one
 * production caller - `report-cost-use-case.ts` resolves every task identity `byTasks` can
 * ever key on before this ever runs - but is read as `{ kind: "none" }` rather than
 * throwing or dropping the record, the same defensive default `taskRowOf`'s own
 * `interval.path` fallback documents: a caller a test can still construct must never lose a
 * record's figures to a gap in wiring this module cannot see from here. */
export function backlogKeyOf(
  taskRow: TaskRow,
  declarations: ReadonlyMap<TaskIdentity, TaskBacklogDeclaration> | undefined
): BacklogRowKey {
  if (typeof taskRow === "string") return taskRow;
  const declaration = declarations?.get(taskRow.task) ?? { kind: "none" as const };
  if (declaration.kind === "none") return NO_BACKLOG_DECLARED;
  if (declaration.kind === "unreadable") return UNREADABLE_BACKLOG_DECLARATION;
  return declaration.link.backlog;
}

/** Both sources, always - the same reason `attributionRows` always gives every one of its
 * own: a
 * source that accounted for nothing is still a fact about this task, not an absent field. */
export function taskAttributionRows(
  taskAttributions: ReadonlyMap<TaskAttributionSource, TotalsAccumulator>
): readonly CostReportTaskAttributionRow[] {
  return TASK_ATTRIBUTION_SOURCES.map((attribution) => ({
    attribution,
    totals: taskAttributions.get(attribution)?.build() ?? { requests: 0 },
  }));
}

// Typed over `string | symbol`, wider than `BacklogRowKey` alone, since a `backlog` map's
// key can also be `NO_BACKLOG_DECLARED` or `UNREADABLE_BACKLOG_DECLARATION` - safe because
// every reason is a plain string and a symbol key never equals one.
function isTaskUnattributedReason(key: string | symbol): key is TaskUnattributedReason {
  return typeof key === "string" && (TASK_UNATTRIBUTED_REASONS as readonly string[]).includes(key);
}

/** Every task a record's own moment fell inside, largest first, then one row per reason
 * actually present for what fell in none - `TASK_UNATTRIBUTED_REASONS`' own fixed order,
 * always after every named task regardless of size, the same convention `personRows` gives
 * its own `none` row. Up to one row per `TASK_UNATTRIBUTED_REASONS` entry, never fewer than
 * the reasons present: two different gaps collapsed into one row is the fault this
 * breakdown exists to avoid. */
export function taskRows(tasks: ReadonlyMap<string, TaskGroup>): readonly CostReportTaskRow[] {
  const named: CostReportTaskRow[] = [];
  const byReason = new Map<TaskUnattributedReason, CostReportTaskRow>();
  for (const group of tasks.values()) {
    const totals = group.totals.build();
    if (group.reason !== undefined) {
      byReason.set(group.reason, { reason: group.reason, totals });
      continue;
    }
    if (group.task === undefined || group.attribution === undefined) continue;
    named.push({ task: group.task, attribution: group.attribution, totals });
  }
  // Tie-broken on the pair, not on the task alone: one task can hold both a declared row and
  // an inferred one, and a tie-break blind to the attribution would order them arbitrarily.
  const sorted = bySize(
    named,
    (row) => row.totals,
    (row) => `${row.task ?? ""}/${row.attribution ?? ""}`
  );
  const reasonRows = TASK_UNATTRIBUTED_REASONS.map((reason) => byReason.get(reason)).filter(
    (row): row is CostReportTaskRow => row !== undefined
  );
  return [...sorted, ...reasonRows];
}

interface BacklogGroups {
  readonly named: readonly CostReportBacklogRow[];
  readonly byReason: ReadonlyMap<TaskUnattributedReason, CostReportBacklogRow>;
  readonly none: CostReportBacklogRow | undefined;
  readonly unreadable: CostReportBacklogRow | undefined;
}

// One pass classifying every backlog key into the four shapes a row can be - named,
// unattributed-by-reason, declared none, or unreadable - nothing sorted yet.
function classifyBacklogGroups(
  backlog: ReadonlyMap<BacklogRowKey, TotalsAccumulator>
): BacklogGroups {
  const named: CostReportBacklogRow[] = [];
  const byReason = new Map<TaskUnattributedReason, CostReportBacklogRow>();
  let none: CostReportBacklogRow | undefined;
  let unreadable: CostReportBacklogRow | undefined;
  for (const [key, accumulator] of backlog) {
    if (isTaskUnattributedReason(key)) {
      byReason.set(key, { reason: key, totals: accumulator.build() });
    } else if (key === NO_BACKLOG_DECLARED) {
      none = { declaration: "none", totals: accumulator.build() };
    } else if (key === UNREADABLE_BACKLOG_DECLARATION) {
      unreadable = { declaration: "unreadable", totals: accumulator.build() };
    } else {
      named.push({ backlog: key, totals: accumulator.build() });
    }
  }
  return { named, byReason, none, unreadable };
}

/** Every backlog item a task declared, largest first, then the two rows for a known task
 * that named none or could not be read, then one row per reason a record fell in no task at
 * all - `TASK_UNATTRIBUTED_REASONS`' own fixed order, the same tail convention `taskRows`
 * uses. Two tasks declaring the same item merge here by construction: `backlogKeyOf` keys
 * both on the identical `backlog` string, so `accumulateInto` folds them into one
 * accumulator before this ever runs - never a second merge step that could disagree with
 * how every other axis already reconciles. */
export function backlogRows(
  backlog: ReadonlyMap<BacklogRowKey, TotalsAccumulator>
): readonly CostReportBacklogRow[] {
  const { named, byReason, none, unreadable } = classifyBacklogGroups(backlog);
  const sorted = bySize(
    named,
    (row) => row.totals,
    (row) => row.backlog ?? ""
  );
  const reasonRows = TASK_UNATTRIBUTED_REASONS.map((reason) => byReason.get(reason)).filter(
    (row): row is CostReportBacklogRow => row !== undefined
  );
  return [...sorted, ...(none ? [none] : []), ...(unreadable ? [unreadable] : []), ...reasonRows];
}

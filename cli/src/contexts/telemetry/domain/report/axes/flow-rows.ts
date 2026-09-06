/** The flow axis: keyed on the closed `FlowInterval` object a record's own moment falls
 * inside, by reference, so two orchestrated runs of the same skill stay two rows. */

import type {
  CostReportFlowRow,
  CostReportSessionJournal,
  TotalsAccumulator,
} from "../../cost-report.js";
import { type FlowInterval, ORCHESTRATING_SKILLS } from "../../flow-attribution.js";
import { momentFallsWithin } from "../../journal-intervals.js";
import type { TelemetrySinkRecord } from "../../telemetry-sink-record.js";
import { bySize, isoSecondsFromMs } from "../row-ordering.js";

// A record falling in no flow interval at all is its own group, keyed on this symbol -
// never a plain string sentinel: a `FlowInterval` is never itself a valid key value here
// (see `FlowRowKey` below), so nothing about a real interval could ever collide with it,
// unlike `NO_BACKLOG_DECLARED`'s own worry about a free-form backlog string.
const OUTSIDE_EVERY_FLOW = Symbol("record falls outside every flow interval");

// Keyed on the closed `FlowInterval` object itself, by reference, never on `skill` alone:
// two orchestrated runs of the same skill in one session are two distinct `FlowInterval`
// objects (`buildFlowIntervals`'s own doc comment), and a `Map` keyed on object identity
// keeps them two rows without needing a synthesized composite string key. A record outside
// every flow can never collide with one inside, since `OUTSIDE_EVERY_FLOW` is a symbol no
// interval object can ever equal.
export type FlowRowKey = FlowInterval | string | typeof OUTSIDE_EVERY_FLOW;

/** Every session's own closed flow intervals, keyed by vendor id - the same shape
 * `allTaskIntervalsByVendorId` gives task intervals, one layer wider. */
export function allFlowIntervalsByVendorId(
  journals: readonly CostReportSessionJournal[]
): ReadonlyMap<string, readonly FlowInterval[]> {
  const byVendorId = new Map<string, readonly FlowInterval[]>();
  for (const journal of journals) {
    if (journal.flowIntervals.length > 0) byVendorId.set(journal.vendorId, journal.flowIntervals);
  }
  return byVendorId;
}

/** Which flow interval a record's own moment falls inside, among all of its session's
 * orchestrated runs - `OUTSIDE_EVERY_FLOW` for a record whose moment falls in none, the
 * same "no reason taxonomy" spec's own hard constraint gives this axis: unlike a task's
 * three distinct gaps, nothing here needs telling apart *why* a record sits outside every
 * flow, since a flow is read from the same sequence either way. Intervals within one
 * session are closed and never overlap (`buildFlowIntervals`), so at most one ever
 * matches. */
export function flowKeyOf(
  record: TelemetrySinkRecord,
  intervalsByVendorId: ReadonlyMap<string, readonly FlowInterval[]>
): FlowRowKey {
  const intervals = intervalsByVendorId.get(record.vendor_id) ?? [];
  const interval = intervals.find((candidate) =>
    momentFallsWithin([candidate], record.event_timestamp)
  );
  return interval ?? flowTheToolNamed(record) ?? OUTSIDE_EVERY_FLOW;
}

/** The orchestrating skill a record's own tool named, for a record no interval covers -
 * the skill name itself as the key, which no `FlowInterval` object and no symbol can ever
 * equal, so the two row kinds never collide.
 *
 * Only `tool-stated`. A `journal-interval` step is an inference from a moment, and the
 * intervals it was inferred from are the very ones just checked; a `prompt-matched` one
 * names the step a prompt opened, which is a step and not an orchestration. Neither says a
 * flow was orchestrated, and reading either as one would put work inside a flow on the
 * strength of the reader's own guess.
 *
 * Why this capture exists at all: a session resumed after its context was compacted invokes
 * nothing again, so no `step_start` hook fires and its journal opens no flow, while the
 * transcript goes on stating the step on every record it produces. Measured on this
 * machine - one such session, six `step_end` lines, no `step_start`, and 2,220 records in a
 * 30-day period that `by_flow` placed outside every flow while `by_step` named the very
 * skill they ran under. */
function flowTheToolNamed(record: TelemetrySinkRecord): string | undefined {
  if (record.step_attribution !== "tool-stated") return undefined;
  return record.step !== undefined && ORCHESTRATING_SKILLS.has(record.step)
    ? record.step
    : undefined;
}

/** Every orchestrated run the period's journals name, largest first, then the one row for
 * work that fell in no flow interval at all - see `CostReportFlowRow`. No reason taxonomy
 * the way `by_task`'s and `by_backlog`'s own remainders carry one (`TASK_UNATTRIBUTED_REASONS`):
 * a flow is read from the same sequence either way, so there is only one fact to state
 * about falling outside every one of them, never several.
 *
 * The remainder is pinned last rather than sorted with the named rows, the same tail
 * convention `taskRows` and `backlogRows` already keep. Sorting it by size put it first
 * whenever work outside every flow outweighed each single run - which is the ordinary case,
 * not a corner one - so the axis led with its own remainder while the two axes beside it
 * led with their largest named row. One breakdown that orders itself differently from its
 * neighbours is read as a different kind of answer, and it is not one. */
export function flowRows(
  flows: ReadonlyMap<FlowRowKey, TotalsAccumulator>
): readonly CostReportFlowRow[] {
  const named: CostReportFlowRow[] = [];
  let outsideEveryFlow: CostReportFlowRow | undefined;
  for (const [key, accumulator] of flows) {
    if (key === OUTSIDE_EVERY_FLOW) {
      outsideEveryFlow = { attribution: "unattributed", totals: accumulator.build() };
      continue;
    }
    // A name is not a run. The tool-stated row is a bucket drawn from however many runs of
    // that skill the tool named, so it carries no `startedAt` - the same reason the row for
    // records that named no prompt carries none.
    if (typeof key === "string") {
      named.push({ flow: key, attribution: "tool-stated", totals: accumulator.build() });
      continue;
    }
    named.push({
      flow: key.skill,
      attribution: "journal-interval",
      startedAt: isoSecondsFromMs(key.startMs),
      totals: accumulator.build(),
    });
  }
  const sorted = bySize(
    named,
    (row) => row.totals,
    (row) => `${row.flow ?? ""}@${row.attribution}@${row.startedAt ?? ""}`
  );
  return outsideEveryFlow === undefined ? sorted : [...sorted, outsideEveryFlow];
}

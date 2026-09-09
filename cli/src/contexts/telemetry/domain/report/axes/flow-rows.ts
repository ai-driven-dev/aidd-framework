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

// A record falling in no flow interval at all is its own group, keyed on a symbol no real
// interval or skill name can ever equal.
const OUTSIDE_EVERY_FLOW = Symbol("record falls outside every flow interval");

// Keyed on the closed `FlowInterval` object itself, by reference, never on `skill` alone: two
// orchestrated runs of the same skill in one session are two distinct interval objects, and a
// `Map` keyed on object identity keeps them two rows without a synthesized composite key.
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
 * orchestrated runs - `OUTSIDE_EVERY_FLOW` for a record whose moment falls in none, with no
 * taxonomy of why: a flow is read from the same sequence either way. Intervals within one
 * session are closed and never overlap, so at most one ever matches. */
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

/** The orchestrating skill a record's own tool named, for a record no interval covers - the
 * skill name itself as the key, which no `FlowInterval` object and no symbol can equal.
 *
 * Only `tool-stated`: a `journal-interval` step is inferred from the very intervals just
 * checked, and a `prompt-matched` one names a step, not an orchestration. This capture exists
 * because a session resumed after its context was compacted invokes nothing again, so no
 * `step_start` fires and its journal opens no flow while the transcript goes on stating the
 * step on every record it produces. */
function flowTheToolNamed(record: TelemetrySinkRecord): string | undefined {
  if (record.step_attribution !== "tool-stated") return undefined;
  return record.step !== undefined && ORCHESTRATING_SKILLS.has(record.step)
    ? record.step
    : undefined;
}

/** Every orchestrated run the period's journals name, largest first, then the one row for work
 * that fell in no flow interval at all. No reason taxonomy, unlike `by_task`'s remainder: there
 * is one fact to state about falling outside every flow, never several. That remainder is
 * pinned last rather than sorted among the named rows, the same tail convention `taskRows` and
 * `backlogRows` keep, since a breakdown ordering itself differently from its neighbours reads
 * as a different kind of answer. */
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
    // A name is not a run: the tool-stated row is a bucket drawn from however many runs of
    // that skill the tool named, so it carries no `startedAt`.
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

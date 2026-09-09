/** The step axis: keyed by the step and the strength of its own attribution, never by the
 * step alone, so a tool-stated reach and a journal-inferred one stay two rows. */

import type {
  CostReportAttributionRow,
  CostReportStepRow,
  TotalsAccumulator,
} from "../../cost-report.js";
import { STEP_ATTRIBUTION_SOURCES, type StepAttributionSource } from "../../step-attribution.js";
import type { TelemetrySinkRecord } from "../../telemetry-sink-record.js";
import { bySize } from "../row-ordering.js";

// A single space cannot occur in a `step_attribution` value, so it separates the two parts of
// the key unambiguously even though a skill name could contain almost anything. The group
// keeps both parts beside its counters rather than parsing them back out of the key, which
// would mean asserting a type back out of a string.
const STEP_ROW_SEPARATOR = " ";

export interface StepGroup {
  readonly attribution: StepAttributionSource;
  readonly step?: string;
  readonly totals: TotalsAccumulator;
}

export function stepRowKey(record: TelemetrySinkRecord): string {
  return `${record.step_attribution}${STEP_ROW_SEPARATOR}${record.step ?? ""}`;
}

/** All four, always, in the declared order. A strength that accounted for nothing is the one
 * place in this report where a zero is the measurement rather than an absence, and dropping
 * the row would leave a consumer unable to tell "no records were attributed this way" from
 * "this report does not carry that field". */
export function attributionRows(
  attributions: ReadonlyMap<StepAttributionSource, TotalsAccumulator>
): readonly CostReportAttributionRow[] {
  return STEP_ATTRIBUTION_SOURCES.map((attribution) => ({
    attribution,
    totals: attributions.get(attribution)?.build() ?? { requests: 0 },
  }));
}

export function stepRows(steps: ReadonlyMap<string, StepGroup>): readonly CostReportStepRow[] {
  const rows: CostReportStepRow[] = [...steps.values()].map((group) => ({
    attribution: group.attribution,
    ...(group.step === undefined ? {} : { step: group.step }),
    totals: group.totals.build(),
  }));
  return bySize(
    rows,
    (row) => row.totals,
    (row) => `${row.step ?? ""}/${row.attribution}`
  );
}

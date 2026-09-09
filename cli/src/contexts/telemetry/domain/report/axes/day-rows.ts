/** The day axis: every UTC day the period spans, whether or not a record landed on it, so
 * a gap in the series is a printed zero rather than a missing row. */

import type { CostReportDayRow, TotalsAccumulator } from "../../cost-report.js";
import {
  type TelemetrySinkRecord,
  telemetrySinkRecordDayKey,
} from "../../telemetry-sink-record.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Every UTC day from `fromDay` to `toDay`, inclusive. A day with nothing is still a row: a
 * gap in a series reads as continuity, so the row has to exist to be a zero. */
export function dayRange(fromDay: string, toDay: string): readonly string[] {
  const days: string[] = [];
  const end = Date.parse(`${toDay}T00:00:00Z`);
  for (let at = Date.parse(`${fromDay}T00:00:00Z`); at <= end; at += MS_PER_DAY) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}

/** Only a day the period itself spans, every one of them already seeded, so a record dated
 * outside the period joins nothing rather than adding a day the report never covered. */
export function addToDayGroup(
  days: Map<string, TotalsAccumulator>,
  record: TelemetrySinkRecord
): void {
  const day = telemetrySinkRecordDayKey(record);
  if (day !== undefined && days.has(day)) days.get(day)?.add(record);
}

/** Every day in the period, in order — never sorted by size, unlike every other breakdown
 * here. A series read out of order is not a series. */
export function dayRows(days: ReadonlyMap<string, TotalsAccumulator>): readonly CostReportDayRow[] {
  return [...days].map(([day, accumulator]) => ({ day, totals: accumulator.build() }));
}

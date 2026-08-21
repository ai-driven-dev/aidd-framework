import type { TelemetrySinkRecord } from "../models/telemetry-sink-record.js";

export interface TelemetrySinkAppendResult {
  readonly filePath: string;
  readonly dayFileIsNew: boolean;
}

/** What a period read returns.
 *
 * `records` are the ones whose `event_timestamp` falls inside the period — when the work
 * ran, which is what "a period" plainly means. It is deliberately not the day file's own
 * name: a session read locally days after it happened lands in the day file for the day it
 * was *stored*, so selecting by file name would put a July session in August's total and
 * look right doing it.
 *
 * `undated` are the records carrying no moment at all. They are handed back rather than
 * placed anywhere, because the only other moment available is the day the line was
 * appended, and that is a fact about receiving rather than about working. A caller names
 * them; it never folds them into a period.
 *
 * `skippedLines` is not diagnostics: a report built from a partial read is
 * indistinguishable from a complete one unless the count travels with the records, and a
 * total that quietly omits lines is the failure this layer exists to prevent. */
export interface TelemetrySinkPeriodRead {
  readonly records: readonly TelemetrySinkRecord[];
  readonly undated: readonly TelemetrySinkRecord[];
  readonly skippedLines: number;
}

/** Separate from `FileWriter`/`FileReader`: a day file is append-only for its whole life,
 * never rewritten in place. `readRecordsForVendor` is the one read: a local re-read needs
 * to know what is already stored for a session before it appends, or every read would
 * double what came before. */
export interface TelemetrySink {
  readonly rootDir: string;
  ensureWritable(): Promise<void>;
  appendRecord(record: TelemetrySinkRecord, at: Date): Promise<TelemetrySinkAppendResult>;
  listDayFiles(): Promise<readonly string[]>;
  deleteDayFile(fileName: string): Promise<void>;
  /** Every stored record whose `vendor_id` matches, across every day file. A line that
   * cannot be parsed is skipped rather than failing the whole scan — a torn final line
   * from a concurrent write must not block reading an unrelated session. */
  readRecordsForVendor(vendorId: string): Promise<readonly TelemetrySinkRecord[]>;
  /** Every stored record whose own moment falls in an inclusive range of UTC days,
   * whatever session it belongs to. Separate from `readRecordsForVendor` because a report
   * asks about a stretch of time, not about a session it already knows the name of. Every
   * day file is read: a record's moment and the file it landed in are different days
   * whenever a session is read after the fact. Skips a line it cannot read for the same
   * reason the per-vendor read does, and counts what it skipped. */
  readRecordsInPeriod(fromDay: Date, toDay: Date): Promise<TelemetrySinkPeriodRead>;
}

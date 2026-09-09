import type { TelemetrySinkRecord } from "../telemetry-sink-record.js";

export interface TelemetrySinkAppendResult {
  readonly filePath: string;
  readonly dayFileIsNew: boolean;
}

/** Every value a filterable field has carried, anywhere this sweep looked - not only in the
 * period returned. Telling a filter naming something that never existed apart from one that
 * simply had no work in this period only stays cheap because these are gathered from the same
 * bytes `records` already comes from, never a second read. */
export interface TelemetrySinkKnownValues {
  readonly projects: ReadonlySet<string>;
  readonly steps: ReadonlySet<string>;
  readonly models: ReadonlySet<string>;
}

/** `records` are those whose `event_timestamp` falls inside the period, never those the day
 * file's own name covers: a session read locally days later lands in the file for the day it
 * was stored. `undated` carry no moment at all and are handed back rather than folded in, and
 * `skippedLines` travels with them because a total quietly omitting lines is indistinguishable
 * from a complete one. */
export interface TelemetrySinkPeriodRead {
  readonly records: readonly TelemetrySinkRecord[];
  readonly undated: readonly TelemetrySinkRecord[];
  readonly skippedLines: number;
  readonly knownValues: TelemetrySinkKnownValues;
}

/** Separate from `FileWriter`/`FileReader`: a day file is append-only for its whole life,
 * never rewritten in place. `readRecordsForVendor` is the one read: a local re-read needs
 * to know what is already stored for a session before it appends, or every read would
 * double what came before. */
export interface TelemetrySink {
  readonly rootDir: string;
  /** How `rootDir` was decided. `"user-config-dir"` is the one a caller has to react to: it
   * means this person set `AIDD_USER_CONFIG_DIR`, which also relocates `auth.json`, so sharing
   * this directory shares a GitHub token. Named on the port because only a command knows where
   * a person is looking when it warns. */
  readonly locatedBy: "telemetry-dir" | "user-config-dir" | "default";
  ensureWritable(): Promise<void>;
  appendRecord(record: TelemetrySinkRecord, at: Date): Promise<TelemetrySinkAppendResult>;
  listDayFiles(): Promise<readonly string[]>;
  /** Removes one day file, by the name `listDayFiles()` named it with, from `dir`. `dir` is
   * never resolved here: the caller supplies the exact directory it already named. `fileName`
   * must name exactly one entry directly inside `dir`; anything else, including a relative
   * walk out of it, is refused rather than deleted. A no-op, not a failure, when the name is
   * already gone. */
  deleteDayFile(dir: string, fileName: string): Promise<void>;
  /** Every stored record whose `vendor_id` matches, across every day file. A line that
   * cannot be parsed is skipped rather than failing the whole scan — a torn final line
   * from a concurrent write must not block reading an unrelated session. */
  readRecordsForVendor(vendorId: string): Promise<readonly TelemetrySinkRecord[]>;
  /** Every stored record whose own moment falls in an inclusive range of UTC days, whatever
   * session it belongs to. Every day file is read: a record's moment and the file it landed in
   * are different days whenever a session is read after the fact. Skips a line it cannot read,
   * and counts what it skipped. */
  readRecordsInPeriod(fromDay: Date, toDay: Date): Promise<TelemetrySinkPeriodRead>;
}

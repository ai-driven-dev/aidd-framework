import type { TelemetrySinkRecord } from "../models/telemetry-sink-record.js";

export interface TelemetrySinkAppendResult {
  readonly filePath: string;
  readonly dayFileIsNew: boolean;
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
}

import type { TelemetrySinkRecord } from "../models/telemetry-sink-record.js";

export interface TelemetrySinkAppendResult {
  readonly filePath: string;
  readonly dayFileIsNew: boolean;
}

/** Separate from `FileWriter`/`FileReader`: a day file is append-only for its whole life,
 * never read back to be rewritten. */
export interface TelemetrySink {
  readonly rootDir: string;
  ensureWritable(): Promise<void>;
  appendRecord(record: TelemetrySinkRecord, at: Date): Promise<TelemetrySinkAppendResult>;
  listDayFiles(): Promise<readonly string[]>;
  deleteDayFile(fileName: string): Promise<void>;
}

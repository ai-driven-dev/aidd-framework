import type { TelemetrySinkRecord } from "../models/telemetry-sink-record.js";

export interface TelemetrySinkAppendResult {
  readonly filePath: string;
  /** True when this append created today's day file — the signal `receive-telemetry-use-case.ts`
   * uses to prune, never on the write path itself. */
  readonly dayFileIsNew: boolean;
}

/**
 * Distinct from `FileWriter`/`FileReader`: those manage whole tracked files a framework
 * install can overwrite; a telemetry day file is append-only for its entire life, one
 * writer, never read back to be rewritten — the same guarantee the run journal's
 * `record.js` keeps for the same reason.
 */
export interface TelemetrySink {
  readonly rootDir: string;
  ensureWritable(): Promise<void>;
  appendRecord(record: TelemetrySinkRecord, at: Date): Promise<TelemetrySinkAppendResult>;
  listDayFiles(): Promise<readonly string[]>;
  deleteDayFile(fileName: string): Promise<void>;
}

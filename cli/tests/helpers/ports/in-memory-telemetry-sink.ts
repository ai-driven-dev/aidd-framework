import {
  type TelemetrySinkRecord,
  telemetrySinkRecordDayKey,
} from "../../../src/domain/models/telemetry-sink-record.js";
import type {
  TelemetrySink,
  TelemetrySinkAppendResult,
  TelemetrySinkPeriodRead,
} from "../../../src/domain/ports/telemetry-sink.js";

function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function dayFileName(at: Date): string {
  return `${dayKey(at)}.jsonl`;
}

/** In-memory double for `TelemetrySink` — day files keyed by name, in append order. */
export class InMemoryTelemetrySink implements TelemetrySink {
  readonly rootDir = "/fake/telemetry";
  readonly files = new Map<string, TelemetrySinkRecord[]>();
  readonly deletedFiles: string[] = [];
  unwritable = false;
  undeletable = new Set<string>();

  async ensureWritable(): Promise<void> {
    if (this.unwritable) throw new Error("sink directory not writable");
  }

  async appendRecord(record: TelemetrySinkRecord, at: Date): Promise<TelemetrySinkAppendResult> {
    const fileName = dayFileName(at);
    const dayFileIsNew = !this.files.has(fileName);
    const records = this.files.get(fileName) ?? [];
    records.push(record);
    this.files.set(fileName, records);
    return { filePath: `${this.rootDir}/${fileName}`, dayFileIsNew };
  }

  async listDayFiles(): Promise<readonly string[]> {
    return [...this.files.keys()].sort();
  }

  async deleteDayFile(fileName: string): Promise<void> {
    if (this.undeletable.has(fileName)) throw new Error(`cannot delete ${fileName}`);
    this.files.delete(fileName);
    this.deletedFiles.push(fileName);
  }

  async readRecordsForVendor(vendorId: string): Promise<readonly TelemetrySinkRecord[]> {
    return [...this.files.values()].flat().filter((record) => record.vendor_id === vendorId);
  }

  /** Selects on each record's own moment through the same domain derivation the real
   * adapter uses, so the two cannot disagree on a non-UTC offset or a malformed moment —
   * the day file a record landed in is when it was stored, not when the work ran. Holds
   * nothing
   * unparseable, so a period read from this double always reports zero skipped; the
   * counting itself is the real adapter's, exercised against real files there. */
  async readRecordsInPeriod(fromDay: Date, toDay: Date): Promise<TelemetrySinkPeriodRead> {
    const [fromKey, toKey] = [dayKey(fromDay), dayKey(toDay)].sort();
    const records: TelemetrySinkRecord[] = [];
    const undated: TelemetrySinkRecord[] = [];
    for (const record of [...this.files.values()].flat()) {
      const key = telemetrySinkRecordDayKey(record);
      if (key === undefined) undated.push(record);
      else if (key >= fromKey && key <= toKey) records.push(record);
    }
    return { records, undated, skippedLines: 0 };
  }
}

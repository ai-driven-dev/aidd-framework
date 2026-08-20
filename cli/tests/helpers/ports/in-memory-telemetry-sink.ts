import type { TelemetrySinkRecord } from "../../../src/domain/models/telemetry-sink-record.js";
import type {
  TelemetrySink,
  TelemetrySinkAppendResult,
} from "../../../src/domain/ports/telemetry-sink.js";

function dayFileName(at: Date): string {
  return `${at.toISOString().slice(0, 10)}.jsonl`;
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
}

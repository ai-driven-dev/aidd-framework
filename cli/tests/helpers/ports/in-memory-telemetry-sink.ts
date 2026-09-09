import type {
  TelemetrySink,
  TelemetrySinkAppendResult,
  TelemetrySinkPeriodRead,
} from "../../../src/contexts/telemetry/domain/ports/telemetry-sink.js";
import {
  type TelemetrySinkRecord,
  telemetrySinkRecordDayKey,
} from "../../../src/contexts/telemetry/domain/telemetry-sink-record.js";

function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function dayFileName(at: Date): string {
  return `${dayKey(at)}.jsonl`;
}

/** `deletedFromDirs` records every `dir` argument `deleteDayFile` received, which is what
 * proves a caller passed the preview's own path and never this double's `rootDir`. */
export class InMemoryTelemetrySink implements TelemetrySink {
  /** Settable, so a test can stand in for a machine that located its figures either way. */
  locatedBy: TelemetrySink["locatedBy"] = "default";
  readonly rootDir = "/fake/telemetry";
  readonly files = new Map<string, TelemetrySinkRecord[]>();
  readonly deletedFiles: string[] = [];
  readonly deletedFromDirs: string[] = [];
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

  async deleteDayFile(dir: string, fileName: string): Promise<void> {
    if (this.undeletable.has(fileName)) throw new Error(`cannot delete ${fileName}`);
    this.deletedFromDirs.push(dir);
    this.files.delete(fileName);
    this.deletedFiles.push(fileName);
  }

  async readRecordsForVendor(vendorId: string): Promise<readonly TelemetrySinkRecord[]> {
    return [...this.files.values()].flat().filter((record) => record.vendor_id === vendorId);
  }

  /** Selects through the same domain derivation the real adapter uses, so the two cannot
   * disagree on a non-UTC offset. Nothing unparseable is held, so skipped is always zero. */
  async readRecordsInPeriod(fromDay: Date, toDay: Date): Promise<TelemetrySinkPeriodRead> {
    const [fromKey, toKey] = [dayKey(fromDay), dayKey(toDay)].sort();
    const records: TelemetrySinkRecord[] = [];
    const undated: TelemetrySinkRecord[] = [];
    const projects = new Set<string>();
    const steps = new Set<string>();
    const models = new Set<string>();
    for (const record of [...this.files.values()].flat()) {
      if (record.project_id !== undefined) projects.add(record.project_id);
      if (record.step !== undefined) steps.add(record.step);
      if (record.model !== undefined) models.add(record.model);
      const key = telemetrySinkRecordDayKey(record);
      if (key === undefined) undated.push(record);
      else if (key >= fromKey && key <= toKey) records.push(record);
    }
    return { records, undated, skippedLines: 0, knownValues: { projects, steps, models } };
  }
}

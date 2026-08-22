import { access, appendFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  parseTelemetrySinkLine,
  serializeTelemetrySinkRecord,
  type TelemetrySinkRecord,
  telemetrySinkRecordDayKey,
} from "../../domain/models/telemetry-sink-record.js";
import type {
  TelemetrySink,
  TelemetrySinkAppendResult,
  TelemetrySinkPeriodRead,
} from "../../domain/ports/telemetry-sink.js";
import { TelemetrySinkUnwritableError } from "../errors.js";

const DAY_FILE_EXTENSION = ".jsonl";
const PRIVATE_FILE_MODE = 0o600;

const DAY_KEY_LENGTH = "YYYY-MM-DD".length;

function dayKey(at: Date): string {
  return at.toISOString().slice(0, DAY_KEY_LENGTH);
}

function dayFileName(at: Date): string {
  return `${dayKey(at)}${DAY_FILE_EXTENSION}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Every write is `appendFile`. `readRecordsForVendor` is the only method that reads a day
 * file's content, and only to let a local re-read know what is already stored. */
export class TelemetrySinkAdapter implements TelemetrySink {
  readonly rootDir: string;

  constructor(userConfigDir?: string) {
    const base =
      userConfigDir ?? process.env.AIDD_USER_CONFIG_DIR ?? join(homedir(), ".config", "aidd");
    this.rootDir = join(base, "telemetry");
  }

  async ensureWritable(): Promise<void> {
    try {
      await mkdir(this.rootDir, { recursive: true });
      const probePath = join(this.rootDir, `.write-check-${process.pid}`);
      await writeFile(probePath, "", { mode: PRIVATE_FILE_MODE });
      await rm(probePath, { force: true });
    } catch (error) {
      throw new TelemetrySinkUnwritableError(this.rootDir, error);
    }
  }

  async appendRecord(record: TelemetrySinkRecord, at: Date): Promise<TelemetrySinkAppendResult> {
    const filePath = join(this.rootDir, dayFileName(at));
    const dayFileIsNew = !(await pathExists(filePath));
    await mkdir(this.rootDir, { recursive: true });
    await appendFile(filePath, `${serializeTelemetrySinkRecord(record)}\n`, {
      mode: PRIVATE_FILE_MODE,
    });
    return { filePath, dayFileIsNew };
  }

  async listDayFiles(): Promise<readonly string[]> {
    try {
      const entries = await readdir(this.rootDir);
      return entries.filter((entry) => entry.endsWith(DAY_FILE_EXTENSION)).sort();
    } catch {
      return [];
    }
  }

  async deleteDayFile(fileName: string): Promise<void> {
    await rm(join(this.rootDir, fileName), { force: true });
  }

  async readRecordsForVendor(vendorId: string): Promise<readonly TelemetrySinkRecord[]> {
    const records: TelemetrySinkRecord[] = [];
    for (const fileName of await this.listDayFiles()) {
      records.push(...(await this.readVendorRecordsFromFile(fileName, vendorId)));
    }
    return records;
  }

  // Every day file is opened, not only the ones the period names: a session read locally
  // days after it ran is appended to today's file while its records carry their own, older
  // moments. Selecting by file name would be selecting by when we heard about the work.
  async readRecordsInPeriod(fromDay: Date, toDay: Date): Promise<TelemetrySinkPeriodRead> {
    const [fromKey, toKey] = [dayKey(fromDay), dayKey(toDay)].sort();
    const records: TelemetrySinkRecord[] = [];
    const undated: TelemetrySinkRecord[] = [];
    let skippedLines = 0;
    const projects = new Set<string>();
    const steps = new Set<string>();
    const models = new Set<string>();
    for (const fileName of await this.listDayFiles()) {
      const read = await this.readAllRecordsFromFile(fileName);
      skippedLines += read.skippedLines;
      for (const record of read.records) {
        if (record.project_id !== undefined) projects.add(record.project_id);
        if (record.step !== undefined) steps.add(record.step);
        if (record.model !== undefined) models.add(record.model);
        const key = telemetrySinkRecordDayKey(record);
        if (key === undefined) undated.push(record);
        else if (key >= fromKey && key <= toKey) records.push(record);
      }
    }
    return { records, undated, skippedLines, knownValues: { projects, steps, models } };
  }

  private async readAllRecordsFromFile(
    fileName: string
  ): Promise<{ records: TelemetrySinkRecord[]; skippedLines: number }> {
    let content: string;
    try {
      content = await readFile(join(this.rootDir, fileName), "utf8");
    } catch {
      // A file listed a moment ago and unreadable now — rotated, deleted, or never ours.
      // Nothing about it is known, so nothing about it is counted as skipped either.
      return { records: [], skippedLines: 0 };
    }
    const records: TelemetrySinkRecord[] = [];
    let skippedLines = 0;
    for (const line of content.split("\n")) {
      if (line.trim() === "") continue;
      const record = this.parseLineOrSkip(line);
      if (record) records.push(record);
      else skippedLines += 1;
    }
    return { records, skippedLines };
  }

  private async readVendorRecordsFromFile(
    fileName: string,
    vendorId: string
  ): Promise<readonly TelemetrySinkRecord[]> {
    const content = await readFile(join(this.rootDir, fileName), "utf8");
    const records: TelemetrySinkRecord[] = [];
    for (const line of content.split("\n")) {
      if (line.trim() === "") continue;
      const record = this.parseLineOrSkip(line);
      if (record?.vendor_id === vendorId) records.push(record);
    }
    return records;
  }

  // A torn final line (a concurrent write still in flight) or a stray older-schema line
  // must not fail an unrelated session's read — skipped, not translated, since there is
  // no typed exception a caller could usefully act on for one line among many.
  private parseLineOrSkip(line: string): TelemetrySinkRecord | undefined {
    try {
      return parseTelemetrySinkLine(line);
    } catch {
      return undefined;
    }
  }
}

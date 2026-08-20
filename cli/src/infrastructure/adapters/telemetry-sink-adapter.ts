import { access, appendFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  serializeTelemetrySinkRecord,
  type TelemetrySinkRecord,
} from "../../domain/models/telemetry-sink-record.js";
import type {
  TelemetrySink,
  TelemetrySinkAppendResult,
} from "../../domain/ports/telemetry-sink.js";
import { TelemetrySinkUnwritableError } from "../errors.js";

const DAY_FILE_EXTENSION = ".jsonl";
const PRIVATE_FILE_MODE = 0o600;

function dayFileName(at: Date): string {
  return `${at.toISOString().slice(0, 10)}${DAY_FILE_EXTENSION}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Every write is `appendFile`; no method here ever reads a day file's content. */
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
}

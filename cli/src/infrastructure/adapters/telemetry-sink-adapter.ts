import { spawnSync } from "node:child_process";
import { chmodSync, readdirSync } from "node:fs";
import { access, appendFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
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
import { resolveHomeDir } from "../home-dir.js";

const DAY_FILE_EXTENSION = ".jsonl";
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIR_MODE = 0o700;

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

function legacyConfigDir(): string {
  return join(resolveHomeDir(), ".config", "aidd");
}

function hasLegacyTelemetryData(): boolean {
  try {
    const entries = readdirSync(join(legacyConfigDir(), "telemetry"));
    return entries.some((entry) => entry.endsWith(DAY_FILE_EXTENSION));
  } catch {
    return false;
  }
}

// `%APPDATA%` is where a Windows application puts this, not `.config` (measured on a real
// windows-latest runner - the plugin's sink.js mirrors this same rule). A machine
// that already journalled under the old `.config` default keeps landing there rather than
// losing access to what it already wrote; only a machine starting fresh gets `%APPDATA%`.
function defaultConfigDir(): string {
  if (process.platform !== "win32") return legacyConfigDir();
  if (hasLegacyTelemetryData()) return legacyConfigDir();
  return process.env.APPDATA ? join(process.env.APPDATA, "aidd") : legacyConfigDir();
}

// The identical no-op in the journal (hooks/lib/repo.js): `mkdir`/`appendFile`'s
// `mode` option is accepted on Windows without error and does nothing with it. `icacls` is
// the mechanism that actually restricts a path there. `%APPDATA%` is already the current OS
// user's own profile, unlike a git checkout that can sit anywhere, so restricting it to that
// same account narrows nothing that Windows' own convention did not already imply.
function restrictToCurrentUser(target: string, options: { recursive?: boolean } = {}): void {
  try {
    const owner = process.env.USERDOMAIN
      ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
      : (process.env.USERNAME ?? userInfo().username);
    if (!owner) return;
    const grant = options.recursive ? `${owner}:(OI)(CI)F` : `${owner}:F`;
    const args = [target, "/inheritance:r", "/grant:r", grant];
    if (options.recursive) args.push("/T");
    args.push("/C", "/Q");
    spawnSync("icacls", args, { encoding: "utf8" });
  } catch {
    // icacls missing, no resolvable owner, or a domain-policy refusal: leave it as it is.
  }
}

/** Every write is `appendFile`. `readRecordsForVendor` is the only method that reads a day
 * file's content, and only to let a local re-read know what is already stored. */
export class TelemetrySinkAdapter implements TelemetrySink {
  readonly rootDir: string;
  // A user who names their own location keeps responsibility for its permissions - the
  // README documents pointing AIDD_USER_CONFIG_DIR at a directory a team shares, and
  // locking that down to one account on Windows would break exactly the sharing it exists
  // for.
  private readonly userNamed: boolean;

  constructor(userConfigDir?: string) {
    const override = userConfigDir ?? process.env.AIDD_USER_CONFIG_DIR;
    this.userNamed = override !== undefined;
    this.rootDir = join(override ?? defaultConfigDir(), "telemetry");
  }

  private tightenDir(): void {
    if (this.userNamed) return;
    if (process.platform === "win32") {
      restrictToCurrentUser(this.rootDir, { recursive: true });
      return;
    }
    // POSIX had no branch at all, so the figures landed in a world-listable directory while
    // the run journal beside them was 0700. `mkdir`'s own `mode` is masked by the process
    // umask and applies only when it creates the directory, so it cannot be relied on for
    // one that already exists. A day file's content was already private at 0600; what
    // leaked was the listing - which days this person worked, and how many.
    try {
      chmodSync(this.rootDir, PRIVATE_DIR_MODE);
    } catch {
      // Someone else's directory, or a filesystem with no modes: the content stays 0600.
    }
  }

  // `/T` on the directory does not reliably carry the grant onto a leaf file it walks into
  // (measured on a real windows-latest runner), so a day file gets its own pass too -
  // only the write that creates it, the one `PRIVATE_FILE_MODE` itself only applies to.
  private tightenFile(filePath: string): void {
    if (this.userNamed || process.platform !== "win32") return;
    restrictToCurrentUser(filePath, { recursive: false });
  }

  async ensureWritable(): Promise<void> {
    try {
      await mkdir(this.rootDir, { recursive: true });
      this.tightenDir();
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
    this.tightenDir();
    await appendFile(filePath, `${serializeTelemetrySinkRecord(record)}\n`, {
      mode: PRIVATE_FILE_MODE,
    });
    if (dayFileIsNew) this.tightenFile(filePath);
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

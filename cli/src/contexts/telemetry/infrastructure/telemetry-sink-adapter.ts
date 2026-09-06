import { spawnSync } from "node:child_process";
import { chmodSync, readdirSync } from "node:fs";
import { access, appendFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import { TelemetrySinkUnwritableError } from "../../../kernel/errors.js";
import { isBareFileName } from "../../../kernel/reading/confined-file-name.js";
import { resolveHomeDir } from "../../../kernel/reading/home-dir.js";
import type {
  TelemetrySink,
  TelemetrySinkAppendResult,
  TelemetrySinkPeriodRead,
} from "../domain/ports/telemetry-sink.js";
import {
  parseTelemetrySinkLine,
  serializeTelemetrySinkRecord,
  type TelemetrySinkRecord,
  telemetrySinkRecordDayKey,
} from "../domain/telemetry-sink-record.js";

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
// windows-latest runner). A machine that already journalled under the old `.config` default
// keeps landing there rather than losing access to what it already wrote; only a machine
// starting fresh gets `%APPDATA%`.
//
// Exported for the test that pins it on any platform rather than only on a Windows runner:
// where the figures land is a pure resolution, and a rule only a rarely-run job can check is
// a rule that regresses in silence. It was the plugin's own sink that held this pin until the
// read path moved here; it holds nothing now, so this is the only place left to hold it.
export function defaultConfigDir(): string {
  if (process.platform !== "win32") return legacyConfigDir();
  if (hasLegacyTelemetryData()) return legacyConfigDir();
  return process.env.APPDATA ? join(process.env.APPDATA, "aidd") : legacyConfigDir();
}

// The identical no-op in the journal (hooks/lib/repo.cjs): `mkdir`/`appendFile`'s
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
  /**
   * `AIDD_TELEMETRY_DIR` names this directory outright; `AIDD_USER_CONFIG_DIR` names the
   * directory *above* it and is kept only so a setup that predates the split keeps working.
   *
   * They are two variables because they answer to two different needs that used to share
   * one name: `AIDD_USER_CONFIG_DIR` also relocates `auth.json` (`auth-storage.ts:19`), a
   * GitHub token, so it could never be the variable a team shares. The full argument, and
   * what to tell someone still on the older one, live in `plugins/aidd-telemetry/README.md`
   * under "Share `AIDD_TELEMETRY_DIR`, never `AIDD_USER_CONFIG_DIR`" - one home, since a
   * copy here would be a second one to keep true.
   */
  readonly rootDir: string;
  // A user who names their own location keeps responsibility for its permissions - a shared
  // directory is what this exists for, and locking it down to one account on Windows would
  // break exactly that sharing.
  private readonly userNamed: boolean;

  /** Which of the three answers above this directory came from. Carried because one of
   * them has a consequence a person has to be told about: `AIDD_USER_CONFIG_DIR` also names
   * where `auth.json` is written, so anyone who set it on the old advice has a credential in
   * the directory they were told to share, and nothing else would ever mention it. */
  readonly locatedBy: "telemetry-dir" | "user-config-dir" | "default";

  constructor(userConfigDir?: string) {
    const named = process.env.AIDD_TELEMETRY_DIR;
    const legacy = userConfigDir ?? process.env.AIDD_USER_CONFIG_DIR;
    this.userNamed = named !== undefined || legacy !== undefined;
    this.rootDir = named ?? join(legacy ?? defaultConfigDir(), "telemetry");
    this.locatedBy =
      named !== undefined ? "telemetry-dir" : legacy !== undefined ? "user-config-dir" : "default";
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

  // `dir` is always a caller-supplied value (never `this.rootDir` re-derived here) — see
  // the port's own doc. `isBareFileName` is the actual confinement: `join` alone normalises
  // `..` away visually but still deletes wherever the normalised path lands, so a
  // `fileName` that is not a bare component of `dir` is refused before it ever reaches `rm`.
  async deleteDayFile(dir: string, fileName: string): Promise<void> {
    if (!isBareFileName(fileName)) {
      throw new Error(`refusing to delete "${fileName}" — not a day file name inside ${dir}`);
    }
    await rm(join(dir, fileName), { force: true });
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
    let content: string;
    try {
      content = await readFile(join(this.rootDir, fileName), "utf8");
    } catch {
      // Same tolerance as `readAllRecordsFromFile`: a file listed a moment ago and
      // unreadable now (rotated, deleted, or never ours) must not fail a vendor-scoped
      // read any more than it fails a full one.
      return [];
    }
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

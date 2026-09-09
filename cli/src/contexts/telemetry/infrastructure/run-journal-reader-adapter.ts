import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { resolvedRunsDir } from "../../../kernel/paths.js";
import { isBareFileName } from "../../../kernel/reading/confined-file-name.js";
import type {
  RunJournal,
  RunJournalBoundary,
  RunJournalFileWritten,
  RunJournalSessionStart,
  RunJournalStore,
  RunJournalTaskDeclared,
} from "../domain/ports/run-journal-reader.js";

/** The one schema this reader knows, mirroring `record.cjs`'s own `SCHEMA_VERSION` and
 * pinned against it by the integration suite. A journal stating any other version is refused
 * rather than read, since its lines can carry another shape entirely. */
export const READABLE_JOURNAL_SCHEMA_VERSION = 2;

const ULID_LENGTH = 26; // encodeTime(10) + encodeRandom(16), matching record.cjs's own ULID_LENGTH.
const RUN_FILE_EXTENSION = ".jsonl";

// Mirrors the hook's own `sanitizePathSegment` character for character, so a vendor id
// sanitized there on write matches what is sanitized here on read. Not a shared import: the
// hook is a zero-dependency CommonJS script. Exported so a test can pin the agreement.
export function sanitizePathSegment(segment: string): string {
  const cleaned = segment.replace(/[^\w.-]/gu, "-");
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "-" : cleaned;
}

// Mirrors record.cjs's parseRunFileName: split on the fixed ULID length, never on "__",
// since a sanitized vendor id can itself contain that substring.
function matchesVendorId(entry: string, wantedSegment: string): boolean {
  if (!entry.endsWith(RUN_FILE_EXTENSION)) return false;
  const minLength = ULID_LENGTH + "__".length + RUN_FILE_EXTENSION.length;
  if (entry.length <= minLength) return false;
  if (entry.slice(ULID_LENGTH, ULID_LENGTH + 2) !== "__") return false;
  return entry.slice(ULID_LENGTH + 2, -RUN_FILE_EXTENSION.length) === wantedSegment;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Absence is never that statement, and neither is a non-finite value: a field nobody wrote,
 * or a torn one, states nothing, and refusing it would drop attribution over an unknown. */
function statesAnotherSchema(session: RunJournalSessionStart | undefined): boolean {
  const stated = session?.schema_version;
  return stated !== undefined && stated !== READABLE_JOURNAL_SCHEMA_VERSION;
}

interface RawJournalLine {
  readonly type?: unknown;
  readonly at?: unknown;
  readonly skill?: unknown;
  readonly turn_id?: unknown;
  readonly run_id?: unknown;
  readonly tool?: unknown;
  readonly vendor_id?: unknown;
  readonly project_id?: unknown;
  readonly project_remote?: unknown;
  readonly worktree_id?: unknown;
  readonly worktree_repo_id?: unknown;
  readonly path?: unknown;
  readonly plugin_version?: unknown;
  readonly schema_version?: unknown;
}

function parseLine(line: string): RawJournalLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as RawJournalLine;
  } catch {
    return null;
  }
}

/** `null` for every other line type and every unparseable line: a torn final line from a
 * session still in progress reads as nothing, not as a boundary at the wrong moment. */
function parseBoundary(parsed: RawJournalLine): RunJournalBoundary | null {
  const at = asString(parsed.at);
  if (at === undefined) return null;
  if (parsed.type === "turn_end") return { type: "turn_end", at };
  const skill = asString(parsed.skill);
  if (skill === undefined) return null;
  // An end with no skill is dropped rather than read as a bare boundary: it would close a
  // step it cannot name.
  if (parsed.type === "step_end") return { type: "step_end", at, skill };
  if (parsed.type !== "step_start") return null;
  const turnId = asString(parsed.turn_id);
  return { type: "step_start", at, skill, ...(turnId === undefined ? {} : { turn_id: turnId }) };
}

/** A plain checkout writes neither key; `asString` rejects `""`, so a torn or empty value
 * reads as "not stated" rather than as a worktree named nothing. */
function parseWorktree(
  parsed: RawJournalLine
): Pick<RunJournalSessionStart, "worktree_id" | "worktree_repo_id"> {
  const worktreeId = asString(parsed.worktree_id);
  const worktreeRepoId = asString(parsed.worktree_repo_id);
  return {
    ...(worktreeId === undefined ? {} : { worktree_id: worktreeId }),
    ...(worktreeRepoId === undefined ? {} : { worktree_repo_id: worktreeRepoId }),
  };
}

/** `run_id`, `tool` and `vendor_id` are all required: a header naming two of the three
 * cannot say which session it belongs to, and a half-read header is worse than none. */
function parseSessionStart(parsed: RawJournalLine): RunJournalSessionStart | null {
  if (parsed.type !== "session_start") return null;
  const at = asString(parsed.at);
  const runId = asString(parsed.run_id);
  const tool = asString(parsed.tool);
  const vendorId = asString(parsed.vendor_id);
  if (at === undefined || runId === undefined || tool === undefined || vendorId === undefined) {
    return null;
  }
  return {
    type: "session_start",
    at,
    run_id: runId,
    tool,
    vendor_id: vendorId,
    ...headerExtras(parsed),
  };
}

/** Each field is absent rather than defaulted: a field the writer left out is one this
 * reader has nothing to say about, and a default would be an answer nobody wrote. */
function headerExtras(parsed: RawJournalLine): Partial<RunJournalSessionStart> {
  const projectId = asString(parsed.project_id);
  const projectRemote = asString(parsed.project_remote);
  const pluginVersion = asString(parsed.plugin_version);
  const schemaVersion = asNumber(parsed.schema_version);
  return {
    ...(schemaVersion === undefined ? {} : { schema_version: schemaVersion }),
    ...(projectId === undefined ? {} : { project_id: projectId }),
    ...(projectRemote === undefined ? {} : { project_remote: projectRemote }),
    ...parseWorktree(parsed),
    ...(pluginVersion === undefined ? {} : { plugin_version: pluginVersion }),
  };
}

function parseFileWritten(parsed: RawJournalLine): RunJournalFileWritten | null {
  if (parsed.type !== "file_written") return null;
  const at = asString(parsed.at);
  const writtenPath = asString(parsed.path);
  return at === undefined || writtenPath === undefined
    ? null
    : { type: "file_written", at, path: writtenPath };
}

function parseTaskDeclared(parsed: RawJournalLine): RunJournalTaskDeclared | null {
  if (parsed.type !== "task_declared") return null;
  const at = asString(parsed.at);
  const declaredPath = asString(parsed.path);
  return at === undefined || declaredPath === undefined
    ? null
    : { type: "task_declared", at, path: declaredPath };
}

/** Mutable so `classifyLine` can fill it one line at a time without every caller threading
 * four separate arrays through. */
interface JournalCollector {
  readonly boundaries: RunJournalBoundary[];
  readonly filesWritten: RunJournalFileWritten[];
  readonly taskDeclarations: RunJournalTaskDeclared[];
  session: RunJournalSessionStart | undefined;
}

function newJournalCollector(): JournalCollector {
  return { boundaries: [], filesWritten: [], taskDeclarations: [], session: undefined };
}

/** The four line types this port promises, tried in the order they are written most often.
 * A line matching none of them is the header. */
function classifyLine(collector: JournalCollector, parsed: RawJournalLine): void {
  const boundary = parseBoundary(parsed);
  if (boundary) {
    collector.boundaries.push(boundary);
    return;
  }
  const written = parseFileWritten(parsed);
  if (written) {
    collector.filesWritten.push(written);
    return;
  }
  const declared = parseTaskDeclared(parsed);
  if (declared) {
    collector.taskDeclarations.push(declared);
    return;
  }
  // The header is written once, first, so keeping the first one read means a second never
  // silently replaces the identity the file opened with.
  collector.session ??= parseSessionStart(parsed) ?? undefined;
}

/** Never throws: a missing run file, an unreadable runs directory or a truncated final line
 * all answer `null` or an empty list, since a damaged journal costs attribution, not the read
 * itself. `AIDD_RUNS_DIR` overrides the directory, resolved once in the constructor so a
 * later relocation cannot change what this instance answers. */
export class RunJournalReaderAdapter implements RunJournalStore {
  readonly runsDir: string;

  constructor(projectRoot: string) {
    this.runsDir = resolvedRunsDir(projectRoot);
  }

  async read(sessionId: string): Promise<RunJournal | null> {
    const filePath = await this.findRunFile(this.runsDir, sessionId);
    return filePath ? this.readJournal(filePath) : null;
  }

  async list(): Promise<readonly RunJournal[]> {
    const dir = this.runsDir;
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }
    const journals: RunJournal[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith(RUN_FILE_EXTENSION)) continue;
      const journal = await this.readJournal(join(dir, entry));
      if (journal) journals.push(journal);
    }
    return journals;
  }

  async listForeignSchemas(): Promise<readonly number[]> {
    const stated: number[] = [];
    for (const fileName of await this.listRunFiles()) {
      const collector = await this.collect(join(this.runsDir, fileName));
      const version = collector?.session?.schema_version;
      if (version !== undefined && version !== READABLE_JOURNAL_SCHEMA_VERSION)
        stated.push(version);
    }
    return stated;
  }

  async listRunFiles(): Promise<readonly string[]> {
    try {
      const entries = await readdir(this.runsDir);
      return entries.filter((entry) => entry.endsWith(RUN_FILE_EXTENSION)).sort();
    } catch {
      return [];
    }
  }

  // `force: true`: a name already gone is nothing to remove, never a failure. `isBareFileName`
  // is the confinement — `join` normalises `..` away visually but still deletes wherever the
  // result lands, so a name that is not a bare component of `dir` never reaches `rm`.
  async deleteRunFile(dir: string, fileName: string): Promise<void> {
    if (!isBareFileName(fileName)) {
      throw new Error(`refusing to delete "${fileName}" — not a run file name inside ${dir}`);
    }
    await rm(join(dir, fileName), { force: true });
  }

  private async findRunFile(dir: string, sessionId: string): Promise<string | null> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return null;
    }
    const wanted = sanitizePathSegment(sessionId);
    const match = entries.find((entry) => matchesVendorId(entry, wanted));
    return match ? join(dir, match) : null;
  }

  private async collect(filePath: string): Promise<JournalCollector | null> {
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      return null;
    }
    const collector = newJournalCollector();
    for (const line of content.split("\n")) {
      const parsed = parseLine(line);
      if (parsed) classifyLine(collector, parsed);
    }
    return collector;
  }

  private async readJournal(filePath: string): Promise<RunJournal | null> {
    const collector = await this.collect(filePath);
    if (!collector || statesAnotherSchema(collector.session)) return null;
    const { boundaries, filesWritten, taskDeclarations, session } = collector;
    return { boundaries, filesWritten, taskDeclarations, ...(session ? { session } : {}) };
  }
}

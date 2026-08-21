import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  RunJournal,
  RunJournalBoundary,
  RunJournalReader,
} from "../../domain/ports/run-journal-reader.js";

const ULID_LENGTH = 26; // encodeTime(10) + encodeRandom(16), matching record.js's own ULID_LENGTH.
const RUN_FILE_EXTENSION = ".jsonl";

// Mirrors plugins/aidd-telemetry/hooks/lib/repo.js's own `sanitizePathSegment`, character
// for character, so a vendor id sanitized there on write matches what is sanitized here on
// read. Not a shared runtime import: the hook is a zero-dependency CommonJS script the
// framework build copies verbatim (see telemetry-project-id.ts's doc comment for the same
// reasoning, applied to project id sanitizing rather than a run file name). Exported so
// run-journal-reader-adapter.integration.test.ts can assert agreement against the hook's
// own function directly, the same way telemetry-project-id.unit.test.ts pins its copy.
export function sanitizePathSegment(segment: string): string {
  const cleaned = segment.replace(/[^\w.-]/gu, "-");
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "-" : cleaned;
}

// Mirrors record.js's parseRunFileName: split on the fixed ULID length, never on "__",
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

interface RawJournalLine {
  readonly type?: unknown;
  readonly at?: unknown;
  readonly skill?: unknown;
}

/** One `step_start` or `turn_end` line, or `null` for every other line type (`session_start`,
 * `file_written`) and every line this file cannot parse — a torn final line from a session
 * still in progress reads as nothing, not as a boundary at the wrong moment. */
function parseBoundary(line: string): RunJournalBoundary | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: RawJournalLine;
  try {
    parsed = JSON.parse(trimmed) as RawJournalLine;
  } catch {
    return null;
  }
  const at = asString(parsed.at);
  if (at === undefined) return null;
  if (parsed.type === "turn_end") return { type: "turn_end", at };
  const skill = parsed.type === "step_start" ? asString(parsed.skill) : undefined;
  return skill !== undefined ? { type: "step_start", at, skill } : null;
}

/**
 * Reads one session's run journal (#663) for the boundaries the interval logic needs, and
 * nothing else — the one class in this path allowed to open a file under `aidd_docs/runs`.
 * Never throws: no run file for this session, an unreadable runs directory, or a truncated
 * final line all answer `null` or an empty boundary list, since a missing or damaged
 * journal costs attribution, not the read itself. `AIDD_RUNS_DIR` overrides the directory
 * outright, matching the hook that writes it.
 */
export class RunJournalReaderAdapter implements RunJournalReader {
  constructor(private readonly projectRoot: string) {}

  async read(sessionId: string): Promise<RunJournal | null> {
    const dir = process.env.AIDD_RUNS_DIR || join(this.projectRoot, "aidd_docs", "runs");
    const filePath = await this.findRunFile(dir, sessionId);
    return filePath ? this.readBoundaries(filePath) : null;
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

  private async readBoundaries(filePath: string): Promise<RunJournal | null> {
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      return null;
    }
    const boundaries: RunJournalBoundary[] = [];
    for (const line of content.split("\n")) {
      const boundary = parseBoundary(line);
      if (boundary) boundaries.push(boundary);
    }
    return { boundaries };
  }
}

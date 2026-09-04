import type { Dirent } from "node:fs";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import type { TranscriptLocation } from "../../../kernel/measurement.js";
import type {
  LocalCostCandidateRecord,
  LocalCostReadResult,
  SessionCostReader,
  TranscriptLineAccumulator,
} from "../../telemetry/domain/ports/session-cost-reader.js";

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(absolutePath);
    else if (entry.isFile()) yield absolutePath;
  }
}

/**
 * Streams a tool's own transcript file(s) for one session and maps them through that tool's
 * pure format module — the only part of the local-read path allowed to open a file. Which
 * directory to search, and which file names belong to a session, are the tool's own
 * declaration (`TranscriptLocation`, from `telemetryLocalRead.transcript`); this class walks
 * and reads, and never encodes a path of its own. A missing directory, or no matching file,
 * answers `sessionFound: false` rather than an empty success — this tool has no trace of
 * that session, which is a different fact from a transcript that exists and holds nothing
 * billable, and not a failure to read either. A file is read through `readline` rather than `readFile`, so a large transcript
 * is never held whole in memory, and a half-written final line (a live session being
 * appended to as this reads) reaches the format module like any other line — its own job to
 * accept or skip.
 */
export class TranscriptCostReaderAdapter implements SessionCostReader {
  constructor(
    private readonly homeDir: string,
    private readonly location: TranscriptLocation,
    private readonly createAccumulator: () => TranscriptLineAccumulator
  ) {}

  async read(sessionId: string): Promise<LocalCostReadResult> {
    const root = this.location.root(this.homeDir);
    const files = await this.findMatchingFiles(root, sessionId);
    const records: LocalCostCandidateRecord[] = [];
    for (const file of files) {
      records.push(...(await this.readFile(file)));
    }
    return { records, sessionFound: files.length > 0 };
  }

  private async findMatchingFiles(root: string, sessionId: string): Promise<string[]> {
    const matches: string[] = [];
    for await (const absolutePath of walk(root)) {
      const relativePath = relative(root, absolutePath);
      if (this.location.matches(relativePath, sessionId)) matches.push(absolutePath);
    }
    return matches;
  }

  private async readFile(path: string): Promise<readonly LocalCostCandidateRecord[]> {
    const accumulator = this.createAccumulator();
    const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of lines) accumulator.push(line);
    return accumulator.build();
  }
}

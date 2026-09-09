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
} from "../domain/ports/session-cost-reader.js";

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

/** Where to search and which names belong to a session are the tool's own declaration; this
 * class walks and reads, and encodes no path of its own. No matching file answers
 * `sessionFound: false`, a different fact from a transcript holding nothing billable. Read
 * through `readline`, so a large transcript is never held whole in memory. */
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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  TaskBacklogDeclaration,
  TaskBacklogLink,
} from "../../domain/models/task-backlog-link.js";
import type { TaskBacklogReader } from "../../domain/ports/task-backlog-reader.js";
import { asPlainObject, isErrnoException } from "../json-file.js";
import { repositoryRootAbove } from "../repository-root.js";

/** The one file a task folder writes to declare its backlog item — see
 * `domain/models/task-backlog-link.ts` for why this is not `metadata.json`. */
export const TASK_BACKLOG_LINK_FILENAME = "backlog-link.json";

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** `null` for anything this file cannot be read as — JSON that will not parse, a shape
 * missing `backlog`, `written_at` or `written_by`, or either provenance field present but
 * not a non-empty string. Deliberately stricter than `PersonIdentityAdapter.read`'s own
 * precedent, which reads a wrong-shaped-but-parseable file as "no identity" rather than
 * "unreadable": this file's own contract requires distinguishing "declared nothing" from
 * "could not be read" (see the port), and a file that exists with a broken shape is
 * evidence of a declaration someone attempted, not one that was never made — so it must
 * surface as damage, never silently read the same as an absent file. */
function parseLink(raw: string): TaskBacklogLink | null {
  const parsed = asPlainObject(JSON.parse(raw));
  const backlog = nonEmptyString(parsed.backlog);
  const writtenAt = nonEmptyString(parsed.written_at);
  const writtenBy = nonEmptyString(parsed.written_by);
  if (backlog === undefined || writtenAt === undefined || writtenBy === undefined) return null;
  return { backlog, writtenAt, writtenBy };
}

/**
 * Reads one task folder's `backlog-link.json` — see `TaskBacklogReader` for the contract
 * this promises: never throws, and never writes. `read()` performs no write of any kind,
 * on any path, in any circumstance — the property that lets a report run against a
 * checkout someone else owns without ever risking the work it is describing.
 */
export class TaskBacklogAdapter implements TaskBacklogReader {
  private readonly repositoryRoot: string;

  // Resolved once, at construction, for the same reason `RunJournalReaderAdapter` freezes
  // its own directory there: a relocation after construction can never change what this
  // instance answers. A task folder path arrives repository-relative, because the journal
  // line it came from was written that way.
  constructor(projectRoot: string) {
    this.repositoryRoot = repositoryRootAbove(projectRoot);
  }

  async read(taskFolderPath: string): Promise<TaskBacklogDeclaration> {
    const filePath = join(this.repositoryRoot, taskFolderPath, TASK_BACKLOG_LINK_FILENAME);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return { kind: "none" };
      return { kind: "unreadable" };
    }
    try {
      const link = parseLink(raw);
      return link === null ? { kind: "unreadable" } : { kind: "declared", link };
    } catch {
      return { kind: "unreadable" };
    }
  }
}

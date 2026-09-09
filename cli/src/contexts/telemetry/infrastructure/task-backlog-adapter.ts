import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { asPlainObjectOrEmpty, isErrnoException } from "../../../kernel/reading/json-file.js";
import { repositoryRootAbove } from "../../../kernel/reading/repository-root.js";
import type { TaskBacklogReader } from "../domain/ports/task-backlog-reader.js";
import type { TaskBacklogDeclaration, TaskBacklogLink } from "../domain/task-backlog-link.js";

/** The one file a task folder writes to declare its backlog item — see
 * `domain/task-backlog-link.ts` for why this is not `metadata.json`. */
export const TASK_BACKLOG_LINK_FILENAME = "backlog-link.json";

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** `null` for anything this file cannot be read as: a broken shape is evidence of a
 * declaration someone attempted, so it must surface as damage rather than read the same as
 * an absent file. */
function parseLink(raw: string): TaskBacklogLink | null {
  const parsed = asPlainObjectOrEmpty(JSON.parse(raw));
  const backlog = nonEmptyString(parsed.backlog);
  const writtenAt = nonEmptyString(parsed.written_at);
  const writtenBy = nonEmptyString(parsed.written_by);
  if (backlog === undefined || writtenAt === undefined || writtenBy === undefined) return null;
  return { backlog, writtenAt, writtenBy };
}

/** Never throws and never writes, on any path: that is what lets a report run against a
 * checkout someone else owns without risking the work it describes. */
export class TaskBacklogAdapter implements TaskBacklogReader {
  private readonly repositoryRoot: string;

  // Resolved once, at construction, so a relocation afterwards cannot change what this
  // instance answers. A task folder path arrives repository-relative, as the journal wrote it.
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

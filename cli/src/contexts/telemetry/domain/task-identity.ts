/** A task's identity is derived here rather than journalled, so it can be revised over every
 * past session. Two shapes are both real tasks — a folder of files and a single `.md` file —
 * and matching only the folder would leave half of them unattributable. The anchoring mirrors
 * `file-writes.cjs`'s own gate: a path refused here never produced a line to read. */
const TASK_FOLDER_PATTERN = /^aidd_docs\/tasks\/(\d{4}_\d{2})\/([^/]+)\//u;
const TASK_FILE_PATTERN = /^aidd_docs\/tasks\/(\d{4}_\d{2})\/([^/]+)\.md$/u;

/** A task's month and its own name. A folder task and a single-file task of the same name
 * resolve to one identity, so a task that grew into a folder does not read as two. */
export type TaskIdentity = string;

/** The task a written path belongs to, answering what the path says and never what is on
 * disk. The path must be repository-relative and `/`-separated, as the journal writes it on
 * every platform. A segment check, not a substring one: the hooks allow `..` inside a name,
 * so only a segment that is exactly `..` climbs out and is refused. */
export function taskIdentityFromWrittenPath(writtenPath: string): TaskIdentity | null {
  if (writtenPath.split("/").includes("..")) return null;
  const match = TASK_FOLDER_PATTERN.exec(writtenPath) ?? TASK_FILE_PATTERN.exec(writtenPath);
  if (!match) return null;
  const [, month, name] = match;
  return month !== undefined && name !== undefined ? `${month}/${name}` : null;
}

/** In first-seen order, without repeats: a session that wrote into two tasks belongs to both,
 * and one that wrote into none is still fully reportable by period. */
export function taskIdentitiesFromWrittenPaths(
  writtenPaths: readonly string[]
): readonly TaskIdentity[] {
  const seen = new Set<TaskIdentity>();
  const identities: TaskIdentity[] = [];
  for (const writtenPath of writtenPaths) {
    const identity = taskIdentityFromWrittenPath(writtenPath);
    if (identity !== null && !seen.has(identity)) {
      seen.add(identity);
      identities.push(identity);
    }
  }
  return identities;
}

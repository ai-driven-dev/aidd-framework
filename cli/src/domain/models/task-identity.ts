/** A task's identity, derived from a path a session wrote into.
 *
 * The run journal deliberately stores no task identity: its `file_written` line carries a
 * repository-relative path and nothing derived from it, on the ground that a conclusion
 * frozen at write time cannot be revised while a derivation re-runs over every past
 * session the day it changes. This module is the other half of that decision.
 *
 * Two shapes exist side by side and both are real tasks — a folder of files, and a single
 * `.md` file — so matching only the folder would leave half of them unattributable. The
 * anchoring mirrors `plugins/aidd-telemetry/hooks/lib/file-writes.cjs`'s own
 * `TASK_PATH_ANCHOR_PATTERN`, which is the gate that decides whether a write is journalled
 * at all: a path this module refuses would never have produced a line to read.
 */
const TASK_FOLDER_PATTERN = /^aidd_docs\/tasks\/(\d{4}_\d{2})\/([^/]+)\//u;
const TASK_FILE_PATTERN = /^aidd_docs\/tasks\/(\d{4}_\d{2})\/([^/]+)\.md$/u;

/** The identity a task is named by: its month and its own name, `2026_08/2026_08_21_slug`.
 * A folder task and a single-file task of the same name resolve to the same identity, so a
 * task that grew from one file into a folder does not read as two tasks. */
export type TaskIdentity = string;

/**
 * The task a written path belongs to, or `null` for a path that belongs to none.
 *
 * Pure: a path in, an identity or nothing out. No filesystem, no configuration, nothing
 * about which tasks exist — a path naming a task nobody has heard of still resolves, since
 * this answers what a path says, not what is on disk.
 *
 * The path must be repository-relative and `/`-separated, which is what the journal writes
 * on every platform. One that climbs out with a literal `..` *segment* belongs to no task.
 * That is a segment check, not a substring one: `file-writes.cjs`'s own gate for a written
 * path, and `task-declared.cjs`'s pattern for a declared one, both allow `..` to appear
 * inside a folder or file name (`2026_02_10_a..b` is a name, not a climb) — only a path
 * segment that is exactly `..` climbs anything, and only that shape is rejected here.
 */
export function taskIdentityFromWrittenPath(writtenPath: string): TaskIdentity | null {
  if (writtenPath.split("/").includes("..")) return null;
  const match = TASK_FOLDER_PATTERN.exec(writtenPath) ?? TASK_FILE_PATTERN.exec(writtenPath);
  if (!match) return null;
  const [, month, name] = match;
  return month !== undefined && name !== undefined ? `${month}/${name}` : null;
}

/** Every task a set of written paths names, in first-seen order and without repeats. A
 * session that wrote into two tasks belongs to both; one that wrote into none belongs to
 * none, and is still fully reportable by period. */
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

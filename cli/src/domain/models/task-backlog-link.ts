import type { TaskIdentity } from "./task-identity.js";

/**
 * The one file a task folder writes to declare which backlog item it delivers —
 * `backlog-link.json`, named for what it is rather than for the fuller, now-rescoped shape
 * #649 first proposed (`metadata.json`, carrying `unit_id`, a `steps[]` journal and
 * `produced` file lists). That shape is not this one: the journal already writes
 * `step_start { at, skill }` and `file_written { at, path, source }`, both timestamped, so
 * which step produced which file is derivable by the same interval mechanism task
 * attribution already reads — a second, hand-written copy of that could disagree with the
 * journal and would be worse than no copy at all. This file carries the one fact nothing
 * else in the repository knows: the backlog item.
 *
 * `backlog` follows `plugins/aidd-pm/skills/10-task/references/persistence.md:13` —
 * *"Use native fields when supported; otherwise use stable ids, URLs, or project-relative
 * paths. Keep one authority across supports."* One field carries the item whichever
 * support it lives on: a forge reference (`"owner/repo#123"`) where the backlog lives with
 * a ticket provider, or a project-relative path (`"aidd_docs/backlog/tasks/x.md"`) where it
 * lives in Markdown. A reader never needs to know which support produced the string — both
 * resolve as the same kind of row.
 *
 * Carries nothing the backlog artefact itself already holds: no `type`, no `work_kind`, no
 * originating ticket. Copying any of those here would let this file and that artefact
 * disagree, which is the one authority the framework's own rule above forbids.
 */
export interface TaskBacklogLink {
  /** The backlog item this task delivers, on whatever support it lives — see the module
   * doc. Never resolved to a title or a state here; that is a destination's work. */
  readonly backlog: string;
  /** When this declaration was written, ISO 8601. Provenance, not status: a wrong link is
   * worse than none, and the only way to judge one is to know which act produced it. */
  readonly writtenAt: string;
  /** What wrote this declaration — a skill's own name (`"aidd-pm:04-spec"`), or `"hand"`
   * for a person who corrected it directly. Beside `writtenAt`, this is what lets a wrong
   * link be traced back to the act that made it. */
  readonly writtenBy: string;
}

/**
 * What reading a task folder's declaration answers — three states, never collapsed into
 * two. `"declared"` and `"none"` are both normal: a folder that names an item and one that
 * names nothing are equally valid states of a task, and neither is an error. `"unreadable"`
 * is different in kind, not degree — the file exists but could not be parsed — and must
 * never print the same as `"none"`: one bad folder's damage must be visible on its own row,
 * never silently folded into "declared nothing".
 */
export type TaskBacklogDeclaration =
  | { readonly kind: "declared"; readonly link: TaskBacklogLink }
  | { readonly kind: "none" }
  | { readonly kind: "unreadable" };

/** The project-relative folder a task's identity resolves to — the inverse of
 * `taskIdentityFromWrittenPath`'s folder branch, and the one shape this module reads a
 * declaration from: a single-file task (`task-identity.ts`'s other shape) has no folder to
 * hold one, so resolving its identity here still yields a path, and a reader asking that
 * path for a declaration simply finds none — the same answer an ordinary folder with no
 * declaration gives, never a special case. */
export function taskFolderPathFromIdentity(identity: TaskIdentity): string {
  return `aidd_docs/tasks/${identity}/`;
}

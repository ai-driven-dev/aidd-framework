import type { TaskIdentity } from "./task-identity.js";

/** `backlog-link.json`, a task folder's declaration of which backlog item it delivers. It
 * carries the one fact nothing else in the repository holds, and nothing the backlog artefact
 * itself already holds — no type, no originating ticket — so the two cannot disagree. */
export interface TaskBacklogLink {
  /** The backlog item, on whatever support it lives: a forge reference where a ticket provider
   * holds the backlog, a project-relative path where Markdown does. Never resolved to a title
   * or a state here; that is a destination's work. */
  readonly backlog: string;
  /** ISO 8601. Provenance, not status: judging a wrong link means knowing which act made it. */
  readonly writtenAt: string;
  /** A skill's own name (`"aidd-pm:04-spec"`), or `"hand"` for a person who corrected it
   * directly — beside `writtenAt`, what traces a wrong link back to the act that made it. */
  readonly writtenBy: string;
}

/** Three states, never two. `"declared"` and `"none"` are both normal states of a task;
 * `"unreadable"` — the file exists and could not be parsed — differs in kind and must never
 * print as `"none"`, so one bad folder's damage stays visible on its own row. */
export type TaskBacklogDeclaration =
  | { readonly kind: "declared"; readonly link: TaskBacklogLink }
  | { readonly kind: "none" }
  | { readonly kind: "unreadable" };

/** The project-relative folder an identity resolves to. A single-file task has no folder to
 * hold a declaration, so a reader asking that path finds none — the same answer an ordinary
 * folder without one gives, never a special case. */
export function taskFolderPathFromIdentity(identity: TaskIdentity): string {
  return `aidd_docs/tasks/${identity}/`;
}

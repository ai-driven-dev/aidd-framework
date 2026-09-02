import type { TaskBacklogDeclaration } from "../models/task-backlog-link.js";

/**
 * What a task backlog reader promises: one task folder's declaration, never a throw. A
 * missing file answers `{ kind: "none" }` — a normal state, not an error — and a file that
 * exists but cannot be parsed answers `{ kind: "unreadable" }`, so a report can distinguish
 * "this task delivers nothing on the backlog" from "this task's declaration is damaged"
 * without either costing the whole period its figures.
 *
 * **Never writes.** Reading what work cost must not modify the work — the property that
 * lets a report run against a checkout someone else owns, and that keeps a read from ever
 * being the thing that introduced the very drift it was asked to measure. An implementation
 * must hold this as an invariant, not merely as today's behaviour.
 */
export interface TaskBacklogReader {
  /** `taskFolderPath` is project-relative, in the shape `taskFolderPathFromIdentity`
   * produces (`aidd_docs/tasks/<month>/<name>/`). Resolving it against a project root, and
   * every other filesystem concern, is the adapter's job. */
  read(taskFolderPath: string): Promise<TaskBacklogDeclaration>;
}

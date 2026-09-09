import type { TaskBacklogDeclaration } from "../task-backlog-link.js";

/**
 * One task folder's declaration, never a throw. A missing file answers `{ kind: "none" }` and
 * an unparseable one `{ kind: "unreadable" }`, so a report tells "this task delivers nothing
 * on the backlog" from "this task's declaration is damaged" without either costing the period
 * its figures. **Never writes**, as an invariant an implementation must hold rather than
 * today's behaviour: a read must never introduce the drift it was asked to measure.
 */
export interface TaskBacklogReader {
  /** `taskFolderPath` is project-relative, in the shape `taskFolderPathFromIdentity`
   * produces (`aidd_docs/tasks/<month>/<name>/`). Resolving it against a project root, and
   * every other filesystem concern, is the adapter's job. */
  read(taskFolderPath: string): Promise<TaskBacklogDeclaration>;
}

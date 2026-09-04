import type { RunJournal } from "./ports/run-journal-reader.js";

/** Which of `session_start`'s two fields named the project. The same reason
 * `vendor_field` exists on the identifier: `project_id` alone is a directory name that
 * collides across machines, `project_remote` is absent without a remote, and a consumer
 * has to be able to tell which one it got. */
export type ProjectField = "project_id" | "project_remote";

export interface SessionProject {
  readonly projectId: string;
  readonly projectField: ProjectField;
}

/**
 * The project a journalled session ran in, one hop past `session_start` — which already
 * resolved both fields and stops there. `project_remote` wins when present: it is the
 * same value for every checkout of one repository, where `project_id` alone falls back to
 * a directory name that does not carry that guarantee.
 *
 * A journal with no session, or a session naming neither field, answers `null` — no
 * project is the honest reading, never a guess at the caller's own repository.
 */
export function resolveSessionProject(journal: RunJournal | null): SessionProject | null {
  const session = journal?.session;
  if (!session) return null;
  if (session.project_remote !== undefined && session.project_remote !== "") {
    return { projectId: session.project_remote, projectField: "project_remote" };
  }
  if (session.project_id !== undefined && session.project_id !== "") {
    return { projectId: session.project_id, projectField: "project_id" };
  }
  return null;
}

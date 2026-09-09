import type { RunJournal } from "./ports/run-journal-reader.js";

/** Which of `session_start`'s two fields named the project: `project_id` is a directory name
 * that collides across machines, so a consumer has to be told which one it got. */
export type ProjectField = "project_id" | "project_remote";

export interface SessionProject {
  readonly projectId: string;
  readonly projectField: ProjectField;
}

/** `project_remote` wins when present: one value for every checkout of a repository, where
 * `project_id` carries no such guarantee. Neither field named answers `null`, never a guess. */
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

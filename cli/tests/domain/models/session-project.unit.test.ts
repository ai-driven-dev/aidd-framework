import { describe, expect, it } from "vitest";
import { resolveSessionProject } from "../../../src/domain/models/session-project.js";
import type {
  RunJournal,
  RunJournalSessionStart,
} from "../../../src/domain/ports/run-journal-reader.js";

function sessionOf(overrides: Partial<RunJournalSessionStart> = {}): RunJournalSessionStart {
  return {
    type: "session_start",
    at: "2026-08-20T09:59:00Z",
    run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    tool: "claude-code",
    vendor_id: "s-1",
    ...overrides,
  };
}

function journalOf(session?: RunJournalSessionStart): RunJournal {
  return { boundaries: [], filesWritten: [], ...(session ? { session } : {}) };
}

describe("resolveSessionProject", () => {
  it("prefers the remote, and says so", () => {
    const journal = journalOf(
      sessionOf({ project_id: "acme-widgets", project_remote: "git@github.com:acme/widgets.git" })
    );

    expect(resolveSessionProject(journal)).toEqual({
      projectId: "git@github.com:acme/widgets.git",
      projectField: "project_remote",
    });
  });

  it("falls back to the directory-name field when no remote exists", () => {
    const journal = journalOf(sessionOf({ project_id: "acme-widgets" }));

    expect(resolveSessionProject(journal)).toEqual({
      projectId: "acme-widgets",
      projectField: "project_id",
    });
  });

  it("names no project when the session carries neither field", () => {
    expect(resolveSessionProject(journalOf(sessionOf()))).toBeNull();
  });

  it("names no project for a journal with no session at all", () => {
    expect(resolveSessionProject(journalOf())).toBeNull();
  });

  it("names no project for a session with no journal at all", () => {
    expect(resolveSessionProject(null)).toBeNull();
  });
});

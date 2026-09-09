import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTaskIntervals } from "../../../../src/contexts/telemetry/domain/task-attribution.js";
import { RunJournalReaderAdapter } from "../../../../src/contexts/telemetry/infrastructure/run-journal-reader-adapter.js";
import { environmentWithoutGitVariables } from "../../../../src/runtime/git/git-environment.js";
import { journalTaskDeclared } from "../../../helpers/telemetry-journal-hook.js";

// A ticket declared on a host whose payload names no path at all, exercised against the real
// hook and the real reader with nothing stubbed between them.
const RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const TASK_PATH = "aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/spec.md";

describe("task_declared, from the hook that writes it to the reader that reads it", () => {
  let projectRoot: string;
  let runsDir: string;

  beforeEach(async () => {
    projectRoot = realpathSync(await mkdtemp(join(tmpdir(), "aidd-task-declared-")));
    execFileSync("git", ["init", "-q", projectRoot], {
      env: environmentWithoutGitVariables(process.env),
    });
    runsDir = join(projectRoot, "aidd_docs", "runs");
    await mkdir(runsDir, { recursive: true });
    await mkdir(join(projectRoot, ".aidd"), { recursive: true });
    await writeFile(
      join(projectRoot, ".aidd", "config.json"),
      JSON.stringify({ telemetry: { enabled: true } })
    );
    await writeFile(
      join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`),
      `${JSON.stringify({
        type: "session_start",
        at: "2026-08-21T09:00:00Z",
        run_id: RUN_ID,
        tool: "codex",
        vendor_id: SESSION_ID,
      })}\n`
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  // Codex has no write-path field on any tool and no distinct "Read" tool: a Bash command
  // reading the plan is the only shape it ever sends.
  function readViaBashPayload(): Record<string, unknown> {
    return {
      tool_name: "Bash",
      tool_input: { command: `sed -n '1,50p' ${TASK_PATH}` },
      cwd: projectRoot,
      session_id: "a-different-id",
    };
  }

  it("appends a repository-relative path the reader surfaces as declared", async () => {
    journalTaskDeclared.handleTaskDeclared(readViaBashPayload(), "codex", SESSION_ID);

    const journal = await new RunJournalReaderAdapter(projectRoot).read(SESSION_ID);

    expect(journal?.taskDeclarations.map((declared) => declared.path)).toEqual([TASK_PATH]);
  });

  it("uses the session id it is handed, not the payload's own spelling", async () => {
    journalTaskDeclared.handleTaskDeclared(readViaBashPayload(), "codex", SESSION_ID);

    const journal = await new RunJournalReaderAdapter(projectRoot).read("a-different-id");

    expect(journal).toBeNull();
  });

  it("declares nothing for a call that names no task path at all", async () => {
    const payload = readViaBashPayload();
    payload.tool_input = { command: "cat cli/src/index.ts" };

    journalTaskDeclared.handleTaskDeclared(payload, "codex", SESSION_ID);

    expect(
      (await new RunJournalReaderAdapter(projectRoot).read(SESSION_ID))?.taskDeclarations
    ).toEqual([]);
  });

  it("derives a bounded interval a report can attribute a record against", async () => {
    journalTaskDeclared.handleTaskDeclared(readViaBashPayload(), "codex", SESSION_ID);

    const journal = await new RunJournalReaderAdapter(projectRoot).read(SESSION_ID);
    expect(journal).not.toBeNull();
    const intervals = buildTaskIntervals(
      journal ?? { boundaries: [], filesWritten: [], taskDeclarations: [] }
    );

    expect(intervals).toHaveLength(1);
    expect(intervals[0].path).toBe(TASK_PATH);
    // Unclosed - no turn_end followed it - so the interval ends at its own start, never at
    // Infinity: a session that crashed here must not attribute a week of later reads to it.
    expect(intervals[0].endMs).toBe(intervals[0].startMs);
  });
});

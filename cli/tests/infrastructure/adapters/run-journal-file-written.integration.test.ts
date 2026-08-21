import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunJournalReaderAdapter } from "../../../src/infrastructure/adapters/run-journal-reader-adapter.js";
import { journalFileWrites } from "../../helpers/telemetry-journal-hook.js";

// The line phase 2's task derivation rests on, exercised against the hook that writes it
// and the adapter that reads it — nothing between them is stubbed. Without this, a change
// to either side would leave every task in a report empty and no test would notice.
const RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const TASK_FILE = "aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/plan.md";

describe("file_written, from the hook that writes it to the reader that reads it", () => {
  let projectRoot: string;
  let runsDir: string;

  beforeEach(async () => {
    // realpath because git resolves symlinks in --show-toplevel and macOS puts tmpdir
    // behind one; the hook compares the two and would otherwise reject every path.
    projectRoot = realpathSync(await mkdtemp(join(tmpdir(), "aidd-file-written-")));
    execFileSync("git", ["init", "-q", projectRoot]);
    runsDir = join(projectRoot, "aidd_docs", "runs");
    await mkdir(runsDir, { recursive: true });
    await mkdir(join(projectRoot, "aidd_docs", "tasks", "2026_08", "2026_08_21_cost-reporter"), {
      recursive: true,
    });
    await writeFile(join(projectRoot, TASK_FILE), "# plan\n");
    await writeFile(join(projectRoot, ".aidd-placeholder"), "");
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
        tool: "claude-code",
        vendor_id: SESSION_ID,
      })}\n`
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  function writePayload(): Record<string, unknown> {
    return {
      tool_name: "Write",
      tool_input: { file_path: join(projectRoot, TASK_FILE) },
      cwd: projectRoot,
      // Deliberately not the id the run file is named with — the hook must use the id it
      // was handed, read behind the host's own declaration, not this spelling.
      session_id: "a-different-id",
    };
  }

  it("appends a repository-relative path the reader surfaces as written", async () => {
    journalFileWrites.handleFileWritten(writePayload(), "claude-code", SESSION_ID);

    const journal = await new RunJournalReaderAdapter(projectRoot).read(SESSION_ID);

    expect(journal?.filesWritten.map((written) => written.path)).toEqual([TASK_FILE]);
  });

  it("uses the session id it is handed, not the payload's own spelling", async () => {
    // With the payload's spelling there is no run file, so nothing would be written at all.
    journalFileWrites.handleFileWritten(writePayload(), "claude-code", SESSION_ID);

    const content = await readFile(join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`), "utf8");

    expect(content).toContain('"file_written"');
    expect(content).not.toContain("a-different-id");
  });

  it("records nothing for a write outside any task folder", async () => {
    const payload = writePayload();
    payload.tool_input = { file_path: join(projectRoot, "cli", "src", "index.ts") };

    journalFileWrites.handleFileWritten(payload, "claude-code", SESSION_ID);

    expect((await new RunJournalReaderAdapter(projectRoot).read(SESSION_ID))?.filesWritten).toEqual(
      []
    );
  });

  it("covers Claude Code alone, which a report has to print as a limit rather than assume away", () => {
    // Not an aspiration: Copilot and Cursor were never captured writing a readable path,
    // and Codex's writes live inside an apply_patch command string. A host absent here
    // yields sessions attributable to a period and a step, never to a task.
    expect(Object.keys(journalFileWrites.WRITTEN_PATH_EXTRACTOR_BY_HOST)).toEqual(["claude-code"]);
  });
});

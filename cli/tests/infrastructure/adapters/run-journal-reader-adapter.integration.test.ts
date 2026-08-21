import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RunJournalReaderAdapter,
  sanitizePathSegment,
} from "../../../src/infrastructure/adapters/run-journal-reader-adapter.js";
import { journalRepo } from "../../helpers/telemetry-journal-hook.js";

// A real-shaped ULID (26 Crockford-base32 characters), matching what
// plugins/aidd-telemetry/hooks/lib/record.js's generateUlid mints — the adapter splits a
// run file's name on this fixed length, never on "__", so the id itself must be genuine.
const RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

function runFileLines(...lines: readonly unknown[]): string {
  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
}

describe("RunJournalReaderAdapter", () => {
  let projectRoot: string;
  let runsDir: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "aidd-run-journal-"));
    runsDir = join(projectRoot, "aidd_docs", "runs");
    await mkdir(runsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    delete process.env.AIDD_RUNS_DIR;
  });

  it("reads a session's step_start and turn_end lines, in file order, skipping every other type", async () => {
    await writeFile(
      join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`),
      runFileLines(
        { type: "session_start", at: "2026-08-20T09:59:00Z", run_id: RUN_ID },
        { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "aidd-dev:02-implement" },
        { type: "file_written", at: "2026-08-20T10:01:00Z", path: "some/task/file.md" },
        { type: "turn_end", at: "2026-08-20T10:05:00Z" }
      )
    );
    const adapter = new RunJournalReaderAdapter(projectRoot);

    const journal = await adapter.read(SESSION_ID);

    expect(journal?.boundaries).toEqual([
      { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "aidd-dev:02-implement" },
      { type: "turn_end", at: "2026-08-20T10:05:00Z" },
    ]);
  });

  it("answers null for a session no run file names, rather than the wrong file", async () => {
    await writeFile(
      join(runsDir, `${RUN_ID}__other-session.jsonl`),
      runFileLines({ type: "step_start", at: "2026-08-20T10:00:00Z", skill: "x" })
    );
    const adapter = new RunJournalReaderAdapter(projectRoot);

    await expect(adapter.read(SESSION_ID)).resolves.toBeNull();
  });

  it("answers null, not an error, when aidd_docs/runs does not exist at all", async () => {
    await rm(runsDir, { recursive: true, force: true });
    const adapter = new RunJournalReaderAdapter(projectRoot);

    await expect(adapter.read(SESSION_ID)).resolves.toBeNull();
  });

  it("skips a truncated final line rather than failing the whole read", async () => {
    const goodLine = JSON.stringify({
      type: "step_start",
      at: "2026-08-20T10:00:00Z",
      skill: "aidd-dev:02-implement",
    });
    await writeFile(
      join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`),
      `${goodLine}\n{"type":"turn_end","at":"2026-08-20T10:05`
    );
    const adapter = new RunJournalReaderAdapter(projectRoot);

    const journal = await adapter.read(SESSION_ID);

    expect(journal?.boundaries).toEqual([
      { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "aidd-dev:02-implement" },
    ]);
  });

  it("honors AIDD_RUNS_DIR over <projectRoot>/aidd_docs/runs, matching the writing hook", async () => {
    const overrideDir = await mkdtemp(join(tmpdir(), "aidd-run-journal-override-"));
    process.env.AIDD_RUNS_DIR = overrideDir;
    await writeFile(
      join(overrideDir, `${RUN_ID}__${SESSION_ID}.jsonl`),
      runFileLines({ type: "step_start", at: "2026-08-20T10:00:00Z", skill: "from-override" })
    );
    const adapter = new RunJournalReaderAdapter(projectRoot);

    const journal = await adapter.read(SESSION_ID);

    expect(journal?.boundaries).toEqual([
      { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "from-override" },
    ]);
    await rm(overrideDir, { recursive: true, force: true });
  });
});

// Duplicated on purpose, not shared at runtime — see the adapter's own doc comment for
// why. This is what proves the duplication stays honest: if repo.js's regex ever moves,
// this test turns red before a session id merely fails to match its own journal file,
// silently, with every other test still green.
describe("sanitizePathSegment — agrees with the journal hook's own function", () => {
  it.each([
    "22222222-2222-4222-8222-222222222222",
    "has spaces",
    "weird/../chars?",
    "",
    ".",
    "..",
    "already__contains-a-double-underscore",
  ])("matches for %s", (segment) => {
    expect(sanitizePathSegment(segment)).toBe(journalRepo.sanitizePathSegment(segment));
  });
});

describe("RunJournalReaderAdapter, beyond the boundaries", () => {
  let projectRoot: string;
  let runsDir: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "aidd-run-journal-more-"));
    runsDir = join(projectRoot, "aidd_docs", "runs");
    await mkdir(runsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    delete process.env.AIDD_RUNS_DIR;
  });

  const HEADER = {
    type: "session_start",
    at: "2026-08-20T09:59:00Z",
    schema_version: 2,
    run_id: RUN_ID,
    project_id: "acme-widgets",
    project_remote: "github.com/acme/widgets",
    tool: "claude-code",
    vendor_id: SESSION_ID,
    vendor_field: "session.id",
  };

  it("reads the header line, so a report knows which tool and project a session was", async () => {
    await writeFile(join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`), runFileLines(HEADER));
    const adapter = new RunJournalReaderAdapter(projectRoot);

    expect((await adapter.read(SESSION_ID))?.session).toEqual({
      type: "session_start",
      at: "2026-08-20T09:59:00Z",
      run_id: RUN_ID,
      project_id: "acme-widgets",
      tool: "claude-code",
      vendor_id: SESSION_ID,
    });
  });

  it("reads the written paths as paths, deriving no task from them", async () => {
    await writeFile(
      join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`),
      runFileLines(
        HEADER,
        {
          type: "file_written",
          at: "2026-08-20T10:01:00Z",
          path: "aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/plan.md",
        },
        { type: "file_written", at: "2026-08-20T10:02:00Z", path: "cli/src/index.ts" }
      )
    );
    const adapter = new RunJournalReaderAdapter(projectRoot);

    const journal = await adapter.read(SESSION_ID);

    expect(journal?.filesWritten).toEqual([
      {
        type: "file_written",
        at: "2026-08-20T10:01:00Z",
        path: "aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/plan.md",
      },
      { type: "file_written", at: "2026-08-20T10:02:00Z", path: "cli/src/index.ts" },
    ]);
    expect(JSON.stringify(journal)).not.toContain("task_id");
  });

  it("keeps a session's boundaries when its header line is torn", async () => {
    await writeFile(
      join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`),
      `{"type":"session_start","at":"2026-08-2\n${runFileLines({ type: "turn_end", at: "2026-08-20T10:05:00Z" })}`
    );
    const adapter = new RunJournalReaderAdapter(projectRoot);

    const journal = await adapter.read(SESSION_ID);

    expect(journal?.session).toBeUndefined();
    expect(journal?.boundaries).toEqual([{ type: "turn_end", at: "2026-08-20T10:05:00Z" }]);
  });

  it("refuses a header missing a field a join needs, rather than surfacing half of one", async () => {
    await writeFile(
      join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`),
      runFileLines({ type: "session_start", at: "2026-08-20T09:59:00Z", run_id: RUN_ID })
    );
    const adapter = new RunJournalReaderAdapter(projectRoot);

    expect((await adapter.read(SESSION_ID))?.session).toBeUndefined();
  });

  it("lists every session it holds, for a caller with no identifier to ask about", async () => {
    const otherSession = "33333333-3333-4333-8333-333333333333";
    const otherRunId = "01ARZ3NDEKTSV4RRFFQ69G5FBW";
    await writeFile(join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`), runFileLines(HEADER));
    await writeFile(
      join(runsDir, `${otherRunId}__${otherSession}.jsonl`),
      runFileLines({ ...HEADER, run_id: otherRunId, tool: "codex", vendor_id: otherSession })
    );
    await writeFile(join(runsDir, "README.md"), "not a run file\n");
    const adapter = new RunJournalReaderAdapter(projectRoot);

    const journals = await adapter.list();

    expect(journals.map((journal) => journal.session?.vendor_id)).toEqual([
      SESSION_ID,
      otherSession,
    ]);
    expect(journals.map((journal) => journal.session?.tool)).toEqual(["claude-code", "codex"]);
  });

  it("lists nothing, rather than throwing, when no runs directory exists", async () => {
    await rm(runsDir, { recursive: true, force: true });
    const adapter = new RunJournalReaderAdapter(projectRoot);

    expect(await adapter.list()).toEqual([]);
  });

  it("honours AIDD_RUNS_DIR when listing, exactly as when reading one session", async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), "aidd-runs-elsewhere-"));
    await writeFile(join(elsewhere, `${RUN_ID}__${SESSION_ID}.jsonl`), runFileLines(HEADER));
    process.env.AIDD_RUNS_DIR = elsewhere;
    const adapter = new RunJournalReaderAdapter(projectRoot);

    expect((await adapter.list()).map((journal) => journal.session?.vendor_id)).toEqual([
      SESSION_ID,
    ]);

    await rm(elsewhere, { recursive: true, force: true });
  });
});

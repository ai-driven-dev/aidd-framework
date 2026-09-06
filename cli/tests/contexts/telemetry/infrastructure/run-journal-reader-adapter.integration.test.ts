import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  READABLE_JOURNAL_SCHEMA_VERSION,
  RunJournalReaderAdapter,
  sanitizePathSegment,
} from "../../../../src/contexts/telemetry/infrastructure/run-journal-reader-adapter.js";
import { journalRecord, journalRepo } from "../../../helpers/telemetry-journal-hook.js";

// A real-shaped ULID (26 Crockford-base32 characters), matching what
// plugins/aidd-telemetry/hooks/lib/record.cjs's generateUlid mints — the adapter splits a
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

  // The hook that writes a journal anchors at `git rev-parse --show-toplevel`
  // (plugins/aidd-telemetry/hooks/lib/repo.cjs), so a session started anywhere inside a
  // checkout writes into ONE directory at its root. A reader anchored at the process
  // working directory instead finds that directory only when the command happens to be run
  // from the root - and answers "this session declared no task" when it is not, which is a
  // claim about the work rather than about the read.
  it("anchors at the repository root, so a subdirectory finds the journal the hook wrote", async () => {
    await mkdir(join(projectRoot, ".git"), { recursive: true });
    await writeFile(
      join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`),
      runFileLines({ type: "step_start", at: "2026-08-20T10:00:00Z", skill: "from-the-root" })
    );
    const subdirectory = join(projectRoot, "cli", "nested");
    await mkdir(subdirectory, { recursive: true });

    const journal = await new RunJournalReaderAdapter(subdirectory).read(SESSION_ID);

    expect(journal?.boundaries).toEqual([
      { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "from-the-root" },
    ]);
  });

  // A linked worktree's `.git` is a FILE holding `gitdir: …`, not a directory. Accepting
  // only a directory would leave every worktree anchored at the process working directory -
  // and this repository is developed in worktrees, so the case is the common one, not a
  // corner.
  it("accepts a linked worktree, whose .git is a file rather than a directory", async () => {
    await writeFile(join(projectRoot, ".git"), "gitdir: /elsewhere/.git/worktrees/w\n");
    await writeFile(
      join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`),
      runFileLines({ type: "step_start", at: "2026-08-20T10:00:00Z", skill: "from-the-worktree" })
    );
    const subdirectory = join(projectRoot, "cli");
    await mkdir(subdirectory, { recursive: true });

    const journal = await new RunJournalReaderAdapter(subdirectory).read(SESSION_ID);

    expect(journal?.boundaries).toEqual([
      { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "from-the-worktree" },
    ]);
  });

  // Outside any checkout there is no root to walk up to. The reader keeps the directory it
  // was handed rather than climbing to the filesystem root and reading a stranger's journal.
  it("keeps the directory it was given when no repository root is above it", async () => {
    const outside = await mkdtemp(join(tmpdir(), "aidd-run-journal-outside-"));
    await mkdir(join(outside, "aidd_docs", "runs"), { recursive: true });
    await writeFile(
      join(outside, "aidd_docs", "runs", `${RUN_ID}__${SESSION_ID}.jsonl`),
      runFileLines({ type: "step_start", at: "2026-08-20T10:00:00Z", skill: "from-outside" })
    );

    const journal = await new RunJournalReaderAdapter(outside).read(SESSION_ID);

    expect(journal?.boundaries).toEqual([
      { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "from-outside" },
    ]);
    await rm(outside, { recursive: true, force: true });
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
// why. This is what proves the duplication stays honest: if repo.cjs's regex ever moves,
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
      schema_version: 2,
      run_id: RUN_ID,
      project_id: "acme-widgets",
      project_remote: "github.com/acme/widgets",
      tool: "claude-code",
      vendor_id: SESSION_ID,
    });
  });

  it("reads plugin_version off the header when the hook stamped one", async () => {
    await writeFile(
      join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`),
      runFileLines({ ...HEADER, plugin_version: "0.1.0" })
    );
    const adapter = new RunJournalReaderAdapter(projectRoot);

    expect((await adapter.read(SESSION_ID))?.session?.plugin_version).toBe("0.1.0");
  });

  it("reads no plugin_version at all for a line written before this field existed - unknown, never a guessed default", async () => {
    await writeFile(join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`), runFileLines(HEADER));
    const adapter = new RunJournalReaderAdapter(projectRoot);

    const session = (await adapter.read(SESSION_ID))?.session;
    expect(session?.plugin_version).toBeUndefined();
    expect(Object.hasOwn(session ?? {}, "plugin_version")).toBe(false);
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

describe("RunJournalReaderAdapter.deleteRunFile — confined to the directory it is handed", () => {
  let projectRoot: string;
  let runsDir: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "aidd-run-journal-delete-"));
    runsDir = join(projectRoot, "aidd_docs", "runs");
    await mkdir(runsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("removes a run file by name, from the directory it is handed", async () => {
    await writeFile(join(runsDir, "a.jsonl"), "content\n");
    const adapter = new RunJournalReaderAdapter(projectRoot);

    await adapter.deleteRunFile(runsDir, "a.jsonl");

    expect(await adapter.listRunFiles()).toEqual([]);
  });

  it("is a no-op, not a failure, when the name is already gone", async () => {
    const adapter = new RunJournalReaderAdapter(projectRoot);
    await expect(adapter.deleteRunFile(runsDir, "never-existed.jsonl")).resolves.toBeUndefined();
  });

  // Finding 4: `deleteRunFile("../../VICTIM.txt")` used to delete outside the runs
  // directory — `join` normalises `..` away visually but still deletes wherever the
  // normalised path lands. Confinement must be a property of this method, not an accident
  // of `readdir` yielding bare components.
  it("refuses a relative walk out of the directory it is handed, rather than deleting outside it", async () => {
    // aidd_docs/runs -> .. -> aidd_docs -> .. -> projectRoot: "../../VICTIM.txt" lands here.
    const victimPath = join(projectRoot, "VICTIM.txt");
    await writeFile(victimPath, "do not delete me\n");
    const adapter = new RunJournalReaderAdapter(projectRoot);

    await expect(adapter.deleteRunFile(runsDir, "../../VICTIM.txt")).rejects.toThrow();

    expect(await readFile(victimPath, "utf8")).toBe("do not delete me\n");
  });

  it("refuses a bare '..' or '.' rather than acting on the directory itself", async () => {
    const adapter = new RunJournalReaderAdapter(projectRoot);
    await expect(adapter.deleteRunFile(runsDir, "..")).rejects.toThrow();
    await expect(adapter.deleteRunFile(runsDir, ".")).rejects.toThrow();
  });

  // Finding 1: `AIDD_RUNS_DIR` relocated between the moment a person is shown `runsDir`
  // (the preview) and the moment `deleteRunFile` runs (the removal) used to reach the
  // relocated directory instead of the one shown, because the old `deleteRunFile` re-read
  // `resolveRunsDir()` on every call. `runsDir` is now frozen at construction, and
  // `deleteRunFile` takes `dir` as an explicit argument — this proves it acts on whatever
  // `dir` it is handed, never on a live re-resolution of `AIDD_RUNS_DIR`.
  it("acts on the dir it is handed, immune to AIDD_RUNS_DIR being relocated afterwards", async () => {
    await writeFile(join(runsDir, "shown.jsonl"), "shown\n");
    const adapter = new RunJournalReaderAdapter(projectRoot);
    const shownDir = adapter.runsDir; // what a preview would have shown

    const elsewhere = await mkdtemp(join(tmpdir(), "aidd-runs-relocated-"));
    await writeFile(join(elsewhere, "shown.jsonl"), "victim\n");
    process.env.AIDD_RUNS_DIR = elsewhere; // relocated AFTER the dir was shown

    await adapter.deleteRunFile(shownDir, "shown.jsonl");

    await expect(readFile(join(shownDir, "shown.jsonl"), "utf8")).rejects.toThrow();
    expect(await readFile(join(elsewhere, "shown.jsonl"), "utf8")).toBe("victim\n");

    delete process.env.AIDD_RUNS_DIR;
    await rm(elsewhere, { recursive: true, force: true });
  });
});

/** The hook stamps `schema_version` on every `session_start` it writes, and until now this
 * reader dropped it — so a journal written under a schema whose line shapes had changed was
 * read as if it were this one, which is a silent misreading rather than a refusal. */
describe("RunJournalReaderAdapter — the schema a journal states it was written under", () => {
  let projectRoot: string;
  let runsDir: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "aidd-run-journal-schema-"));
    runsDir = join(projectRoot, "aidd_docs", "runs");
    await mkdir(runsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  function header(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      type: "session_start",
      at: "2026-08-20T09:59:00Z",
      run_id: RUN_ID,
      tool: "claude-code",
      vendor_id: SESSION_ID,
      ...extra,
    };
  }

  async function writeJournal(...lines: readonly unknown[]): Promise<void> {
    await writeFile(join(runsDir, `${RUN_ID}__${SESSION_ID}.jsonl`), runFileLines(...lines));
  }

  // Reached rather than copied: a reader whose own constant is a second copy of the writer's
  // goes on claiming it can read a schema the writer has already moved past.
  it("reads exactly the schema the hook writes", () => {
    expect(READABLE_JOURNAL_SCHEMA_VERSION).toBe(journalRecord.SCHEMA_VERSION);
  });

  it("carries the stated schema through onto the session it read", async () => {
    await writeJournal(header({ schema_version: READABLE_JOURNAL_SCHEMA_VERSION }));
    const adapter = new RunJournalReaderAdapter(projectRoot);

    const journal = await adapter.read(SESSION_ID);

    expect(journal?.session?.schema_version).toBe(READABLE_JOURNAL_SCHEMA_VERSION);
  });

  // The point of a version field: a key added under the schema this reader knows is a key it
  // may ignore, never one that costs it the journal.
  it("reads a journal carrying a key it has never heard of, under a schema it knows", async () => {
    await writeJournal(
      header({ schema_version: READABLE_JOURNAL_SCHEMA_VERSION, a_key_from_later: "ignored" }),
      { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "aidd-dev:02-implement" }
    );
    const adapter = new RunJournalReaderAdapter(projectRoot);

    const journal = await adapter.read(SESSION_ID);

    expect(journal?.session?.vendor_id).toBe(SESSION_ID);
    expect(journal?.boundaries).toHaveLength(1);
  });

  it("refuses a journal written under a schema newer than the one it reads", async () => {
    await writeJournal(header({ schema_version: READABLE_JOURNAL_SCHEMA_VERSION + 1 }), {
      type: "step_start",
      at: "2026-08-20T10:00:00Z",
      skill: "aidd-dev:02-implement",
    });
    const adapter = new RunJournalReaderAdapter(projectRoot);

    expect(await adapter.read(SESSION_ID)).toBeNull();
    expect(await adapter.list()).toEqual([]);
  });

  it("refuses one written under the schema this log replaced, whose lines are another shape", async () => {
    await writeJournal(header({ schema_version: 1 }));
    const adapter = new RunJournalReaderAdapter(projectRoot);

    expect(await adapter.read(SESSION_ID)).toBeNull();
  });

  // Absence is not a stated disagreement. Every journal on disk before this reader looked at
  // the field was read without it, and refusing them now would drop attribution this reader
  // has always been able to give - the fault "an unknown is never a zero" names, applied to
  // the reader rather than to a figure.
  it("still reads a journal that states no schema at all", async () => {
    await writeJournal(header({}), {
      type: "step_start",
      at: "2026-08-20T10:00:00Z",
      skill: "aidd-dev:02-implement",
    });
    const adapter = new RunJournalReaderAdapter(projectRoot);

    const journal = await adapter.read(SESSION_ID);

    expect(journal?.session?.schema_version).toBeUndefined();
    expect(journal?.boundaries).toHaveLength(1);
  });

  // What a refusal must not cost: the fact that a run file is there. Dropped silently, the
  // diagnostic reads "none carry a readable session_start" about a file whose header it read
  // perfectly well, and prints a torn write as the cause of a version disagreement.
  it("still names the schema of every journal it refused", async () => {
    await writeJournal(header({ schema_version: READABLE_JOURNAL_SCHEMA_VERSION + 1 }));
    const adapter = new RunJournalReaderAdapter(projectRoot);

    expect(await adapter.listForeignSchemas()).toEqual([READABLE_JOURNAL_SCHEMA_VERSION + 1]);
  });
});

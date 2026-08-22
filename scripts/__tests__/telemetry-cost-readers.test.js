const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it, before, after } = require("node:test");

const SCRIPTS = path.resolve(__dirname, "../../plugins/aidd-telemetry/skills/01-cost/scripts");
const SHARED = path.resolve(__dirname, "../../plugins/aidd-telemetry/skills/_shared");
const { TOOLS } = require(path.join(SHARED, "readers.js"));
const { listJournals, readJournal, projectOf } = require(path.join(SHARED, "journal.js"));

const FIXTURES = path.resolve(__dirname, "../../cli/tests/fixtures/local-cost");
const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";
const CODEX_SESSION = "019fae6f-2009-7cd3-86b2-b8f83481b160";
const CODEX_PARENT = "019f69d0-9e1f-7951-86c9-ddb23cfd51f4";

const readerFor = (tool) => TOOLS.find((declaration) => declaration.tool === tool).read;

describe("reading what Claude Code wrote about a session", () => {
  const read = (sessionId) => readerFor("claude")(FIXTURES, sessionId);

  it("counts one record per billed call, not one per transcript line", () => {
    // Several assistant lines can share a requestId - one call streamed in parts.
    const { records } = read(CLAUDE_SESSION);

    assert.equal(records.length, 4);
    assert.equal(new Set(records.map((record) => record.turn_id)).size, 4);
  });

  it("reaches the subagent's own file, not only the session's", () => {
    const { records } = read(CLAUDE_SESSION);

    assert.equal(records.filter((record) => record.agent_name === "Explore").length, 1);
  });

  it("carries the skill the tool named itself, where it named one", () => {
    const { records } = read(CLAUDE_SESSION);

    assert.deepEqual(
      records.map((record) => record.step).filter(Boolean),
      ["probe-echo"],
    );
  });

  it("leaves the step absent rather than claiming no skill ran", () => {
    // The field is omitted both when no skill ran and when the tool predates it, and
    // nothing on the line separates the two.
    const withoutSkill = read(CLAUDE_SESSION).records.filter((r) => r.step === undefined);

    assert.ok(withoutSkill.length > 0);
    for (const record of withoutSkill) assert.ok(!("step" in record));
  });

  it("says it found no session for an id no file names", () => {
    assert.deepEqual(read("no-such-session"), { records: [], sessionFound: false });
  });
});

describe("reading what Codex wrote about a session", () => {
  const read = (sessionId) => readerFor("codex")(FIXTURES, sessionId);

  it("sums each turn's own increments, never its running total", () => {
    // Real captured last_token_usage for turn one: {22229,20224,0,231}, {24692,21248,0,206},
    // {27769,24320,0,390} as input, cached, cache_write, output. Summing total_token_usage
    // instead would give 22229 -> 46921 -> 74690.
    const [first] = read(CODEX_SESSION).records;

    assert.equal(first.output_tokens, 231 + 206 + 390);
  });

  it("reports input exclusive of cache, as every other reader does", () => {
    // Codex counts input inclusive of cached; Claude Code does not. Subtracting is what
    // keeps the field meaning one thing across tools.
    const [first] = read(CODEX_SESSION).records;

    assert.equal(first.input_tokens, 22229 - 20224 + (24692 - 21248) + (27769 - 24320));
    assert.equal(first.cache_read_tokens, 20224 + 21248 + 24320);
  });

  it("takes the moment from the turn's own start, not from a counted event inside it", () => {
    const [first] = read(CODEX_SESSION).records;

    assert.equal(first.event_timestamp, "2026-07-29T15:12:27.889Z");
  });

  it("resolves a resumed session by its own id, never its parent's", () => {
    // 124 of 330 rollouts measured on one machine are resumed sessions where the two differ.
    const resumed = read(CODEX_SESSION);
    const parent = read(CODEX_PARENT);

    assert.equal(resumed.records.length, 2);
    assert.equal(parent.records.length, 1);
    assert.ok(resumed.records.every((record) => record.vendor_id === CODEX_SESSION));
  });

  it("omits a counter no event of the turn ever carried", () => {
    const [first] = read(CODEX_SESSION).records;

    assert.equal(first.cache_creation_tokens, 0);
    assert.ok(!("cost_usd" in first));
  });
});

describe("reading what Copilot wrote about a session", () => {
  const read = (sessionId) => readerFor("copilot")(FIXTURES, sessionId);
  const COPILOT_SESSION = "33333333-3333-4333-8333-333333333333";
  const COPILOT_EMPTY_SESSION = "44444444-4444-4444-8444-444444444444";

  it("yields one kind: session record, carrying the four counters from session.shutdown", () => {
    const { records, sessionFound } = read(COPILOT_SESSION);

    assert.equal(sessionFound, true);
    assert.equal(records.length, 1);
    const [record] = records;
    assert.equal(record.kind, "session");
    assert.equal(record.input_tokens, 10);
    assert.equal(record.output_tokens, 42);
    assert.equal(record.cache_read_tokens, 0);
    assert.equal(record.cache_creation_tokens, 21070);
  });

  it("never reads modelMetrics.usage.inputTokens, which is inclusive of the cache figure", () => {
    // Measured: 10 (tokenDetails.input) + 21070 (cache_write) = 21080 (usage.inputTokens).
    // Reading the latter as input_tokens would double count the cache-write figure.
    const [record] = read(COPILOT_SESSION).records;

    assert.notEqual(record.input_tokens, 21080);
  });

  it("never stores totalPremiumRequests as cost_usd", () => {
    const [record] = read(COPILOT_SESSION).records;

    assert.ok(!("cost_usd" in record));
  });

  it("names no model - currentModel is only ever the last model a session used", () => {
    const [record] = read(COPILOT_SESSION).records;

    assert.ok(!("model" in record));
  });

  it("carries a turn_id stable across a re-read, so a sweep never stores it twice", () => {
    const [record] = read(COPILOT_SESSION).records;

    assert.equal(record.turn_id, "99ccf9e7-b3ac-4145-a622-31852ec698cb");
    assert.equal(record.turn_field, "id");
  });

  it("reads empty, not a record of zeros, when shutdown carried no tokenDetails", () => {
    const { records, sessionFound } = read(COPILOT_EMPTY_SESSION);

    assert.equal(sessionFound, true);
    assert.deepEqual(records, []);
  });

  it("says it found no session for an id no file names", () => {
    assert.deepEqual(read("no-such-session"), { records: [], sessionFound: false });
  });
});

describe("what each tool declares it can supply", () => {
  it("declares a route per tool, and never a bare boolean for both", () => {
    for (const { tool, capability } of TOOLS) {
      assert.ok(capability, `${tool} declares no capability`);
      assert.ok("localRead" in capability && "export" in capability, tool);
    }
  });

  it("gives a tool it cannot read a reason instead of a reader", () => {
    for (const declaration of TOOLS) {
      if (declaration.read) continue;
      assert.ok(declaration.reason, `${declaration.tool} is unreadable and says nothing`);
      assert.equal(declaration.capability.localRead, null);
    }
  });

  it("measures, rather than assumes, what Copilot's local read supplies", () => {
    const copilot = TOOLS.find((t) => t.tool === "copilot");

    assert.deepEqual(copilot.capability.localRead, {
      tokenCounters: true,
      amount: false,
      toolStatedStep: false,
    });
    assert.ok(copilot.limitation, "a session-total figure needs a caveat a report can print");
  });

  it("says which tools the journal never names, so a sweep cannot look idle", () => {
    // False means two things: no step from an interval, and a sweep never reaches one of
    // that tool's sessions - readable, and still empty until a session is named by hand.
    const unreachable = TOOLS.filter((t) => !t.capability.journalAttributable).map((t) => t.tool);

    assert.deepEqual(unreachable, []);
  });
});

describe("reading the run journal a session left behind", () => {
  let projectRoot;

  const line = (value) => `${JSON.stringify(value)}\n`;

  before(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-journal-"));
    const runs = path.join(projectRoot, "aidd_docs", "runs");
    fs.mkdirSync(runs, { recursive: true });
    fs.writeFileSync(
      path.join(runs, "01ARZ3NDEKTSV4RRFFQ69G5FAV__session-one.jsonl"),
      line({
        type: "session_start",
        at: "2026-08-20T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        tool: "claude-code",
        vendor_id: "session-one",
      }) +
        line({ type: "step_start", at: "2026-08-20T09:01:00Z", skill: "alpha" }) +
        line({ type: "file_written", at: "2026-08-20T09:02:00Z", path: "a/b.md", source: "observed" }) +
        line({ type: "turn_end", at: "2026-08-20T09:03:00Z" }) +
        '{"type":"step_start","at":"2026-08-2',
    );
    fs.writeFileSync(path.join(runs, "README.md"), "not a run file\n");
  });

  after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  it("names the session, its tool and the run it belongs to", () => {
    const journal = readJournal(projectRoot, "session-one");

    assert.equal(journal.session.vendor_id, "session-one");
    assert.equal(journal.session.tool, "claude-code");
  });

  it("keeps the boundaries in the order they were written", () => {
    const journal = readJournal(projectRoot, "session-one");

    assert.deepEqual(
      journal.boundaries.map((boundary) => boundary.type),
      ["step_start", "turn_end"],
    );
  });

  it("surfaces written paths as paths, deriving no task from them", () => {
    const journal = readJournal(projectRoot, "session-one");

    assert.deepEqual(
      journal.filesWritten.map((written) => written.path),
      ["a/b.md"],
    );
    assert.ok(!JSON.stringify(journal).includes("task_id"));
  });

  it("keeps a session readable when its last line is torn", () => {
    // A file being appended to while it is read must not cost the lines already in it.
    const journal = readJournal(projectRoot, "session-one");

    assert.equal(journal.boundaries.length, 2);
  });

  it("lists every session it holds, ignoring what is not a run file", () => {
    const journals = listJournals(projectRoot);

    assert.deepEqual(
      journals.map((journal) => journal.session.vendor_id),
      ["session-one"],
    );
  });

  it("lists nothing, rather than failing, when no journal exists", () => {
    assert.deepEqual(listJournals(path.join(projectRoot, "nowhere")), []);
    assert.equal(readJournal(projectRoot, "never-journalled"), null);
  });
});

describe("deciding which project a record belongs to", () => {
  const journalOf = (session) => ({ session, boundaries: [], filesWritten: [] });

  it("names the project from the remote, and says which field it came from", () => {
    const journal = journalOf({
      run_id: "r",
      tool: "claude-code",
      vendor_id: "s-1",
      project_id: "widgets",
      project_remote: "git@github.com:acme/widgets.git",
    });

    assert.deepEqual(projectOf(journal), {
      project_id: "git@github.com:acme/widgets.git",
      project_field: "project_remote",
    });
  });

  it("falls back to the directory-name field when no remote exists", () => {
    const journal = journalOf({ run_id: "r", tool: "claude-code", vendor_id: "s-1", project_id: "widgets" });

    assert.deepEqual(projectOf(journal), { project_id: "widgets", project_field: "project_id" });
  });

  it("names no project when the session carries neither field", () => {
    assert.deepEqual(projectOf(journalOf({ run_id: "r", tool: "claude-code", vendor_id: "s-1" })), {});
  });

  it("names no project for a session with no journal at all", () => {
    assert.deepEqual(projectOf(null), {});
    assert.deepEqual(projectOf({ boundaries: [], filesWritten: [] }), {});
  });
});

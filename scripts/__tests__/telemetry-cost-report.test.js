const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { describe, it, before, after } = require("node:test");

const SCRIPTS = path.resolve(__dirname, "../../plugins/aidd-telemetry/skills/01-cost/scripts");
const SHARED = path.resolve(__dirname, "../../plugins/aidd-telemetry/skills/01-cost/scripts/lib");
const HOOKS_LIB = path.resolve(__dirname, "../../plugins/aidd-telemetry/hooks/lib");
const { buildIntervals, attribute } = require(path.join(SHARED, "attribution.cjs"));
const { build, taskOf, toMicroUsd } = require(path.join(SCRIPTS, "lib/report.cjs"));
const { printReport, toEnvelope, buildArtefact, ARTEFACT_AXES } = require(path.join(SCRIPTS, "lib/render.cjs"));
const sink = require(path.join(SCRIPTS, "lib/sink.cjs"));
const { listJournals } = require(path.join(SHARED, "journal.cjs"));
const {
  buildSessionStartLine,
  buildFileWrittenLine,
  appendLine,
  runFileName,
  generateUlid,
} = require(path.join(HOOKS_LIB, "record.cjs"));

const NO_CAPABILITY = {
  localRead: null,
  export: null,
  journalAttributable: false,
  taskAttributable: false,
};

const request = (overrides) => ({
  kind: "request",
  vendor_id: "s-1",
  tool: "claude",
  step_attribution: "unattributed",
  ...overrides,
});

function report(overrides = {}) {
  return build({
    fromDay: "2026-08-17",
    toDay: "2026-08-21",
    records: [],
    journals: [],
    declaredTools: [{ tool: "claude", coverage: "covered", capability: NO_CAPABILITY }],
    undatedRecords: 0,
    unreadableLines: 0,
    ...overrides,
  });
}

function rendered(built) {
  const lines = [];
  printReport((line) => lines.push(line), built);
  return lines.join("\n");
}

describe("deciding which step a record belongs to", () => {
  const journalOf = (...boundaries) => ({ boundaries });
  const step = (at, skill) => ({ type: "step_start", at, skill });
  const turnEnd = (at) => ({ type: "turn_end", at });

  it("closes a step at whatever happened next, never at a duration it invented", () => {
    const intervals = buildIntervals(
      journalOf(step("2026-08-20T10:00:00Z", "A"), turnEnd("2026-08-20T10:05:00Z")),
    );

    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].endMs, Date.parse("2026-08-20T10:05:00Z"));
  });

  it("gives two interleaved skills three intervals and two names", () => {
    const intervals = buildIntervals(
      journalOf(
        step("2026-08-20T10:00:00Z", "A"),
        step("2026-08-20T10:01:00Z", "B"),
        step("2026-08-20T10:02:00Z", "A"),
        turnEnd("2026-08-20T10:03:00Z"),
      ),
    );

    assert.deepEqual(
      intervals.map((interval) => interval.skill),
      ["A", "B", "A"],
    );
  });

  it("leaves a step still open when nothing closed it", () => {
    const [interval] = buildIntervals(journalOf(step("2026-08-20T10:00:00Z", "A")));

    assert.equal(interval.endMs, Number.POSITIVE_INFINITY);
  });

  it("drops a boundary whose own moment cannot be read", () => {
    // Left in, it would occupy an index while carrying no moment, and the step before it
    // would silently inherit the moment of the boundary after it.
    const intervals = buildIntervals(
      journalOf(step("2026-08-20T10:00:00Z", "A"), step("not-a-moment", "B"), turnEnd("2026-08-20T10:09:00Z")),
    );

    assert.deepEqual(
      intervals.map((interval) => interval.skill),
      ["A"],
    );
    assert.equal(intervals[0].endMs, Date.parse("2026-08-20T10:09:00Z"));
  });

  it("prefers what the tool stated over an interval that also covers it", () => {
    const intervals = buildIntervals(journalOf(step("2026-08-20T10:00:00Z", "from-journal")));

    const answer = attribute({ step: "from-tool", event_timestamp: "2026-08-20T10:01:00Z" }, intervals);

    assert.deepEqual(answer, { step_attribution: "tool-stated" });
  });

  it("reads a record earlier than every interval as unattributed, not as the first step", () => {
    // Folding it in would assume work began the instant a marker happened to be written.
    const intervals = buildIntervals(journalOf(step("2026-08-20T10:00:00Z", "A")));

    assert.deepEqual(attribute({ event_timestamp: "2026-08-20T09:00:00Z" }, intervals), {
      step_attribution: "unattributed",
    });
  });

  it("reads a record with no moment as unattributed", () => {
    assert.deepEqual(attribute({}, []), { step_attribution: "unattributed" });
  });
});

describe("deriving a task from a path a session wrote", () => {
  it("names the task a folder or a single file belongs to, identically", () => {
    assert.equal(taskOf("aidd_docs/tasks/2026_08/2026_08_21_x/plan.md"), "2026_08/2026_08_21_x");
    assert.equal(taskOf("aidd_docs/tasks/2026_08/2026_08_21_x.md"), "2026_08/2026_08_21_x");
  });

  it("names no task for a path outside any task folder", () => {
    for (const outside of ["cli/src/index.ts", "aidd_docs/tasks/README.md", "aidd_docs/memory/x.md"]) {
      assert.equal(taskOf(outside), null, outside);
    }
  });

  it("names no task for a path that climbs out of the tree", () => {
    assert.equal(taskOf("aidd_docs/tasks/2026_08/../../../etc/passwd"), null);
  });
});

describe("summing a period without counting anything twice", () => {
  it("takes money and tokens from billed requests alone", () => {
    // A session record is one flush window's own delta of quantities the request records
    // already report in full; adding both counts part of the session twice.
    const built = report({
      records: [
        request({ cost_usd: 0.16, input_tokens: 100 }),
        { kind: "session", vendor_id: "s-1", tool: "claude", cost_usd: 0.0151, input_tokens: 7 },
      ],
    });

    assert.equal(built.totals.costMicroUsd, toMicroUsd(0.16));
    assert.equal(built.totals.inputTokens, 100);
  });

  it("takes active time from session records alone, and never breaks it down by step", () => {
    const built = report({
      records: [
        request({ step: "implement", step_attribution: "tool-stated", cost_usd: 1 }),
        { kind: "session", vendor_id: "s-1", tool: "claude", active_time_s: 47 },
      ],
    });

    assert.equal(built.activeTimeSeconds, 47);
    assert.ok(!JSON.stringify(built.bySteps).includes("active"));
  });

  it("leaves a quantity nobody observed absent, rather than calling it zero", () => {
    const built = report({ records: [request({ input_tokens: 0 })] });

    assert.equal(built.totals.inputTokens, 0);
    assert.ok(!("outputTokens" in built.totals));
    assert.ok(!("costMicroUsd" in built.totals));
  });

  it("sums every breakdown back to the total it belongs to", () => {
    const records = [
      request({ turn_id: "a", cost_usd: 0.1, model: "opus", step: "impl", step_attribution: "tool-stated" }),
      request({ turn_id: "b", cost_usd: 0.02, model: "opus", step: "impl", step_attribution: "journal-interval" }),
      request({ turn_id: "c", cost_usd: 0.003, model: "haiku" }),
    ];
    const built = report({ records });
    const total = (rows) => rows.reduce((sum, row) => sum + (row.totals.costMicroUsd ?? 0), 0);

    for (const rows of [built.bySteps, built.byModels, built.attributionMix]) {
      assert.equal(total(rows), built.totals.costMicroUsd);
    }
  });

  it("keeps one skill reached two ways as two rows, never merged into one claim", () => {
    const built = report({
      records: [
        request({ turn_id: "a", cost_usd: 1, step: "impl", step_attribution: "tool-stated" }),
        request({ turn_id: "b", cost_usd: 1, step: "impl", step_attribution: "journal-interval" }),
      ],
    });

    assert.equal(built.bySteps.filter((row) => row.step === "impl").length, 2);
  });

  it("answers with every attribution strength, in one order, zeros included", () => {
    // A strength that accounted for nothing is the one place a zero is the measurement.
    assert.deepEqual(
      report().attributionMix.map((row) => [row.attribution, row.totals.requests]),
      [
        ["tool-stated", 0],
        ["journal-interval", 0],
        ["unattributed", 0],
      ],
    );
  });

  it("reads the same records in any order the same way", () => {
    // A re-read appends, so the sink's line order differs between machines and is not
    // something a consumer controls.
    const records = [
      request({ turn_id: "a", cost_usd: 1, model: "opus" }),
      request({ turn_id: "b", cost_usd: 1, model: "haiku" }),
      request({ turn_id: "c", cost_usd: 2, model: "sonnet", tool: "codex" }),
    ];

    assert.equal(
      JSON.stringify(report({ records: [...records].reverse() })),
      JSON.stringify(report({ records })),
    );
  });
});

// Mirrors cli/tests/domain/models/cost-report.unit.test.ts's "buildCostReport - an unknown
// keeps its row, never a zero". The reconciliation fixtures above all carry a model, a cost
// and a step - the reason none of them ever reach the branches below.
describe("an unknown keeps its row, never a zero", () => {
  it("gives a record with no model its own row in byModels, and it still reconciles", () => {
    const built = report({
      records: [
        request({ turn_id: "a", cost_usd: 2, model: "opus" }),
        request({ turn_id: "b", cost_usd: 1 }),
      ],
    });

    assert.equal(built.byModels.length, 2);
    const unknown = built.byModels.find((row) => row.model === undefined);
    assert.equal(unknown.totals.requests, 1);
    assert.equal(unknown.totals.costMicroUsd, toMicroUsd(1));

    const total = built.byModels.reduce((sum, row) => sum + (row.totals.costMicroUsd ?? 0), 0);
    assert.equal(total, built.totals.costMicroUsd);
  });

  // `JSON.stringify(NaN)` is `null` - the same round trip a record takes through sink.cjs's
  // own `append`/`readDayFile`, so this is not a synthetic value: it is what a damaged
  // `cost_usd` looks like once it has actually been written to and read back from disk.
  it("reads a non-numeric cost as unknown, never as a zero", () => {
    const damaged = JSON.parse(JSON.stringify({ ...request({ turn_id: "x" }), cost_usd: Number.NaN }));
    assert.equal(damaged.cost_usd, null);

    const built = report({ records: [damaged] });

    assert.equal(built.totals.requests, 1);
    assert.ok(!("costMicroUsd" in built.totals));
  });

  it("gives a damaged moment no day row, while the total still holds it", () => {
    const damaged = {
      ...request({ turn_id: "y", cost_usd: 5 }),
      event_timestamp: "not-a-momentZ",
    };
    const built = report({ records: [damaged] });

    assert.equal(built.totals.requests, 1);
    assert.equal(built.totals.costMicroUsd, toMicroUsd(5));
    const total = built.byDays.reduce((sum, row) => sum + (row.totals.costMicroUsd ?? 0), 0);
    assert.equal(total, 0);
    assert.ok(built.byDays.every((row) => row.totals.requests === 0));
  });

  // Every tool this report has ever seen runs at 90%-plus cache, so a weight blind to the
  // two cache counters orders a costless breakdown by the sliver of its volume nobody reads
  // it for - here, backwards. Mirrors cli/tests/domain/models/cost-report.unit.test.ts.
  it("weighs a costless row by all four counters, cache included - not input and output alone", () => {
    const built = report({
      records: [
        request({ turn_id: "light-cache", model: "light-cache", input_tokens: 500, output_tokens: 500 }),
        request({
          turn_id: "heavy-cache",
          model: "heavy-cache",
          input_tokens: 10,
          output_tokens: 5,
          cache_read_tokens: 900_000,
        }),
      ],
    });

    assert.deepEqual(
      built.byModels.map((row) => row.model),
      ["heavy-cache", "light-cache"],
    );
  });
});

// A user who enables the OTLP export and also runs the local read sees every billed
// request line twice: once from each route. Both fixtures below are real captured export
// payloads - `otlp-logs-claude-code.json` (one main-agent request) and
// `otlp-logs-claude-code-subagent.json` (a main-agent request and the subagent request it
// spawned) - the `claude_code.api_request` attribute sets are read straight off them, never
// hand-built: three billed calls, matching the defect report's own worked count. The
// local-read half is what `readers.cjs`'s `claudeRecords` would produce for those exact
// same three billed calls: same `billed_request_id` (Claude Code's `requestId`, carried by
// both routes for the same call), no `cost_usd` (no local reader has ever captured one), a
// tool-stated `step` the export route never carries at all. `requests` and `inputTokens`
// below reproduce the defect report's own figures exactly (6 naive, 3 collapsed; 12 naive,
// 6 collapsed); `outputTokens`/`cacheReadTokens` do not - these two checked-in fixtures
// carry smaller figures than whatever fuller session the report was written against, so
// this test checks its own union's true totals rather than asserting numbers these
// fixtures cannot produce. Mirrors cli/tests/domain/models/cost-report.unit.test.ts.
describe("one billed call, seen by both routes, counts once", () => {
  const FIXTURES_DIR = path.resolve(__dirname, "../../cli/tests/fixtures/telemetry-sink");

  function apiRequestsFrom(fixtureName) {
    const payload = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, fixtureName), "utf8"));
    const records = [];
    for (const resourceLog of payload.resourceLogs ?? []) {
      for (const scopeLog of resourceLog.scopeLogs ?? []) {
        for (const logRecord of scopeLog.logRecords ?? []) {
          if (logRecord.body?.stringValue !== "claude_code.api_request") continue;
          const attrs = Object.fromEntries(
            (logRecord.attributes ?? []).map((a) => [a.key, Object.values(a.value)[0]]),
          );
          records.push({
            kind: "request",
            tool: "claude",
            vendor_id: attrs["session.id"],
            vendor_field: "session.id",
            billed_request_id: attrs.request_id,
            step_attribution: "unattributed",
            cost_usd: attrs.cost_usd,
            input_tokens: attrs.input_tokens,
            output_tokens: attrs.output_tokens,
            cache_read_tokens: attrs.cache_read_tokens,
            cache_creation_tokens: attrs.cache_creation_tokens,
            model: attrs.model,
            event_timestamp: attrs["event.timestamp"],
          });
        }
      }
    }
    return records;
  }

  function exportedApiRequests() {
    return [
      ...apiRequestsFrom("otlp-logs-claude-code.json"),
      ...apiRequestsFrom("otlp-logs-claude-code-subagent.json"),
    ];
  }

  function localCounterpartOf(exported) {
    return {
      kind: "request",
      tool: exported.tool,
      vendor_id: exported.vendor_id,
      vendor_field: "sessionId",
      turn_id: exported.billed_request_id,
      turn_field: "requestId",
      billed_request_id: exported.billed_request_id,
      step_attribution: "tool-stated",
      step: "aidd-dev:02-implement",
      input_tokens: exported.input_tokens,
      output_tokens: exported.output_tokens,
      cache_read_tokens: exported.cache_read_tokens,
      cache_creation_tokens: exported.cache_creation_tokens,
      model: exported.model,
      event_timestamp: exported.event_timestamp,
    };
  }

  it("sums a naive union of both routes' records to double - the reproduced defect", () => {
    const exported = exportedApiRequests();
    assert.equal(exported.length, 3);
    const local = exported.map(localCounterpartOf);
    const naiveUnion = [...exported, ...local];

    assert.equal(naiveUnion.length, 6);
    const naiveInputTokens = naiveUnion.reduce((sum, r) => sum + (r.input_tokens ?? 0), 0);
    assert.equal(naiveInputTokens, 12);
  });

  it("collapses the two routes' records for the same call into one, in the built report", () => {
    const exported = exportedApiRequests();
    const local = exported.map(localCounterpartOf);
    const trueCostMicroUsd = exported.reduce((sum, r) => sum + toMicroUsd(r.cost_usd ?? 0), 0);
    const trueInputTokens = exported.reduce((sum, r) => sum + (r.input_tokens ?? 0), 0);
    const trueOutputTokens = exported.reduce((sum, r) => sum + (r.output_tokens ?? 0), 0);
    const trueCacheReadTokens = exported.reduce((sum, r) => sum + (r.cache_read_tokens ?? 0), 0);

    const union = [...exported, ...local];
    const built = report({ records: union });

    // One billed call, counted once, whichever route or routes saw it. 3 requests and 6
    // input tokens match the defect report's own worked numbers exactly.
    assert.equal(built.totals.requests, 3);
    assert.equal(trueInputTokens, 6);
    assert.equal(built.totals.costMicroUsd, trueCostMicroUsd);
    assert.equal(built.totals.inputTokens, trueInputTokens);
    assert.equal(built.totals.outputTokens, trueOutputTokens);
    assert.equal(built.totals.cacheReadTokens, trueCacheReadTokens);

    // Neither route's own strength is thrown away for the other's: the export's money
    // survives, and so does the local read's tool-stated step.
    const toolStated = built.attributionMix.find((row) => row.attribution === "tool-stated");
    assert.equal(toolStated.totals.requests, 3);
    assert.equal(toolStated.totals.costMicroUsd, trueCostMicroUsd);

    // Order-independent: a re-read's line order is never something a consumer controls,
    // and neither is which of two duplicate deliveries for one billed call arrives first.
    const reversed = report({ records: [...union].reverse() });
    assert.equal(JSON.stringify(reversed), JSON.stringify(built));
  });
});

describe("a local-read session total, the first record kind: 'session' report figure", () => {
  const COPILOT_CAPABILITY = {
    localRead: { tokenCounters: true, amount: false, toolStatedStep: false },
    export: { tokenCounters: false, amount: false, toolStatedStep: false },
    journalAttributable: true,
    taskAttributable: false,
  };
  const copilotSession = (overrides) => ({
    kind: "session",
    vendor_id: "s-1",
    tool: "copilot",
    provenance: "local-read",
    input_tokens: 10,
    output_tokens: 42,
    cache_read_tokens: 0,
    cache_creation_tokens: 21070,
    ...overrides,
  });

  function reportWithCopilot(overrides = {}) {
    return build({
      fromDay: "2026-08-17",
      toDay: "2026-08-21",
      records: [],
      journals: [],
      declaredTools: [
        { tool: "claude", coverage: "covered", capability: NO_CAPABILITY },
        { tool: "copilot", coverage: "covered", capability: COPILOT_CAPABILITY },
      ],
      undatedRecords: 0,
      unreadableLines: 0,
      ...overrides,
    });
  }

  it("carries a session total on the tool's own row, never on the period total", () => {
    const built = reportWithCopilot({ records: [copilotSession()] });
    const copilotRow = built.byTools.find((row) => row.tool === "copilot");

    assert.deepEqual(copilotRow.sessionTotals, {
      requests: 0,
      inputTokens: 10,
      outputTokens: 42,
      cacheReadTokens: 0,
      cacheCreationTokens: 21070,
    });
    // Never summed with a request line's totals: the two-kinds rule forbids it, and this
    // report never merges the two even where only one kind exists for a tool.
    assert.deepEqual(built.totals, { requests: 0 });
  });

  it("never enters by_step or by_day - it reconciles with neither", () => {
    const built = reportWithCopilot({
      records: [copilotSession({ event_timestamp: "2026-08-19T10:00:00Z" })],
    });

    assert.equal(built.bySteps.length, 0);
    for (const day of built.byDays) assert.deepEqual(day.totals, { requests: 0 });
  });

  it("prints the session total on the tool's row, not 'nothing in this period'", () => {
    const text = rendered(reportWithCopilot({ records: [copilotSession()] }));

    assert.match(text, /GitHub Copilot\s+21,122 tokens \(session total, not requests\)/u);
    assert.ok(!/GitHub Copilot\s+nothing in this period/u.test(text));
  });

  it("carries session_totals in the envelope, snake_case, beside the ordinary totals", () => {
    const envelope = toEnvelope(reportWithCopilot({ records: [copilotSession()] }));
    const copilotRow = envelope.by_tool.find((row) => row.tool === "copilot");

    assert.deepEqual(copilotRow.session_totals, {
      requests: 0,
      input_tokens: 10,
      output_tokens: 42,
      cache_read_tokens: 0,
      cache_creation_tokens: 21070,
    });
    assert.deepEqual(copilotRow.totals, { requests: 0 });
  });

  it("stays off every row for a tool with none - session_totals is never a default", () => {
    const envelope = toEnvelope(reportWithCopilot({ records: [] }));

    for (const row of envelope.by_tool) assert.ok(!("session_totals" in row));
  });

  it("never folds an export-route session delta into the by-tool session total", () => {
    // Only a local-read "session" record is a one-shot, already-complete total; an
    // export-route one is a periodic flush's own delta and is never safe to show this way.
    const built = reportWithCopilot({
      records: [copilotSession({ provenance: "export", tool: "claude" })],
    });
    const claudeRow = built.byTools.find((row) => row.tool === "claude");

    assert.ok(!("sessionTotals" in claudeRow));
  });
});

describe("restricting a period to one task", () => {
  const journals = [
    {
      session: { vendor_id: "s-task", tool: "claude-code" },
      filesWritten: [{ path: "aidd_docs/tasks/2026_08/wanted/plan.md" }],
      boundaries: [],
    },
    {
      session: { vendor_id: "s-other", tool: "claude-code" },
      filesWritten: [{ path: "cli/src/index.ts" }],
      boundaries: [],
    },
  ];
  const records = [
    request({ vendor_id: "s-task", cost_usd: 1 }),
    request({ vendor_id: "s-other", cost_usd: 2 }),
    request({ vendor_id: "s-unjournalled", cost_usd: 4 }),
  ];

  it("counts only the sessions that wrote into the task asked for", () => {
    const built = report({ records, journals, task: "2026_08/wanted" });

    assert.equal(built.totals.costMicroUsd, toMicroUsd(1));
    assert.equal(built.sessions, 1);
  });

  it("counts every session when no task is asked for, journalled or not", () => {
    const built = report({ records, journals });

    assert.equal(built.totals.costMicroUsd, toMicroUsd(7));
    assert.equal(built.sessions, 3);
  });

  it("attaches a session that wrote into no task folder to no task at all", () => {
    assert.equal(report({ records, journals, task: "2026_08/never" }).totals.requests, 0);
  });
});

describe("a task can be declared, not just derived", () => {
  const declared = (at, taskPath) => ({ type: "task_declared", at, path: taskPath });
  const turnEnd = (at) => ({ type: "turn_end", at });
  const WANTED = "2026_08/wanted";
  const WANTED_PATH = "aidd_docs/tasks/2026_08/wanted/spec.md";

  it("attributes a tool whose payloads name no path at all - a declared interval, never a written file", () => {
    const journals = [
      {
        session: { vendor_id: "s-declared", tool: "codex" },
        filesWritten: [],
        boundaries: [turnEnd("2026-08-17T11:00:00Z")],
        taskDeclarations: [declared("2026-08-17T10:00:00Z", WANTED_PATH)],
      },
    ];
    const records = [request({ vendor_id: "s-declared", cost_usd: 1, event_timestamp: "2026-08-17T10:30:00Z" })];

    const built = report({ records, journals, task: WANTED });

    assert.equal(built.totals.requests, 1);
    assert.equal(built.totals.costMicroUsd, toMicroUsd(1));
    const mix = Object.fromEntries(built.taskAttributionMix.map((row) => [row.attribution, row.totals.requests]));
    assert.deepEqual(mix, { declared: 1, inferred: 0 });
  });

  it("a session that never declared and never wrote into the folder belongs to none - never the last one seen", () => {
    const journals = [
      {
        session: { vendor_id: "s-silent", tool: "codex" },
        filesWritten: [],
        boundaries: [turnEnd("2026-08-17T11:00:00Z")],
        taskDeclarations: [],
      },
    ];
    const records = [request({ vendor_id: "s-silent", cost_usd: 9, event_timestamp: "2026-08-17T10:30:00Z" })];

    assert.equal(report({ records, journals, task: WANTED }).totals.requests, 0);
  });

  it("a declaration left open by one session does not reach a later, unrelated one", () => {
    const journals = [
      {
        // Crashed mid-task: declared once, then nothing else - no closing turn_end at all.
        session: { vendor_id: "s-crashed", tool: "codex" },
        filesWritten: [],
        boundaries: [],
        taskDeclarations: [declared("2026-08-17T10:00:00Z", WANTED_PATH)],
      },
      {
        // A wholly different session, later in the same period, that never named this task.
        session: { vendor_id: "s-later", tool: "codex" },
        filesWritten: [],
        boundaries: [turnEnd("2026-08-20T09:05:00Z")],
        taskDeclarations: [],
      },
    ];
    const records = [
      request({ vendor_id: "s-later", cost_usd: 5, event_timestamp: "2026-08-20T09:00:00Z" }),
    ];

    assert.equal(report({ records, journals, task: WANTED }).totals.requests, 0);
  });

  it("an unclosed declaration is capped at the journal's own last recorded moment, never left boundless", () => {
    const journals = [
      {
        session: { vendor_id: "s-crashed", tool: "codex" },
        filesWritten: [],
        boundaries: [],
        // Nothing follows the declaration - the crash. The interval it derives to must end
        // at this same moment, not at Infinity.
        taskDeclarations: [declared("2026-08-17T10:00:00Z", WANTED_PATH)],
      },
    ];
    const records = [
      // A re-read stores this later, but it did not happen before the crash - the journal
      // never recorded a moment past 10:00:00Z, so nothing after it can be "declared".
      request({ vendor_id: "s-crashed", cost_usd: 3, event_timestamp: "2026-08-17T10:30:00Z" }),
    ];

    assert.equal(report({ records, journals, task: WANTED }).totals.requests, 0);
  });

  it("a declared interval closes at the next turn_end - work after it falls back to inferred, or out of scope entirely", () => {
    const journals = [
      {
        session: { vendor_id: "s-mixed", tool: "claude-code" },
        filesWritten: [{ path: WANTED_PATH }],
        boundaries: [turnEnd("2026-08-17T10:15:00Z")],
        taskDeclarations: [declared("2026-08-17T10:00:00Z", WANTED_PATH)],
      },
    ];
    const records = [
      // Inside the declared window.
      request({ vendor_id: "s-mixed", cost_usd: 1, turn_id: "a", event_timestamp: "2026-08-17T10:05:00Z" }),
      // After the closing turn_end - the declaration no longer covers it, but the session
      // still wrote into the task folder at some point, so it falls back to inferred.
      request({ vendor_id: "s-mixed", cost_usd: 2, turn_id: "b", event_timestamp: "2026-08-17T10:20:00Z" }),
    ];

    const built = report({ records, journals, task: WANTED });

    assert.equal(built.totals.requests, 2);
    const mix = Object.fromEntries(built.taskAttributionMix.map((row) => [row.attribution, row.totals.requests]));
    assert.deepEqual(mix, { declared: 1, inferred: 1 });
  });
});

// Runs the real `read` command over a real transcript, so this exercises store()'s join
// end to end - never attribution.cjs's attribute() in isolation, which the fixture above
// already covers.
describe("a session's stored record names the project it ran in", () => {
  const CLI = path.join(SCRIPTS, "telemetry-report.cjs");
  const FIXTURES = path.resolve(__dirname, "../../cli/tests/fixtures/local-cost");
  const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";

  let configDir;
  let runsDir;

  before(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-project-sink-"));
    runsDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-project-runs-"));
  });

  after(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(runsDir, { recursive: true, force: true });
  });

  function writeSessionStart(extra) {
    const runId = generateUlid();
    appendLine(
      path.join(runsDir, runFileName(runId, CLAUDE_SESSION)),
      buildSessionStartLine({
        at: "2026-08-05T19:00:00Z",
        runId,
        host: "claude-code",
        vendorId: CLAUDE_SESSION,
        ...extra,
      }),
    );
  }

  function readAndStore() {
    const result = spawnSync(process.execPath, [CLI, "read"], {
      encoding: "utf8",
      env: { ...process.env, HOME: FIXTURES, PATH: "", AIDD_USER_CONFIG_DIR: configDir, AIDD_RUNS_DIR: runsDir },
    });
    assert.equal(result.status, 0, result.stderr);
  }

  function storedRecords() {
    const dir = path.join(configDir, "telemetry");
    return fs
      .readdirSync(dir)
      .flatMap((name) => fs.readFileSync(path.join(dir, name), "utf8").trim().split("\n"))
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line));
  }

  it("prefers the remote, and says so", () => {
    writeSessionStart({ projectId: "widgets", projectRemote: "git@github.com:acme/widgets.git" });
    readAndStore();

    const records = storedRecords();
    assert.ok(records.length > 0);
    for (const record of records) {
      assert.equal(record.project_id, "git@github.com:acme/widgets.git");
      assert.equal(record.project_field, "project_remote");
    }
  });

  it("falls back to the directory-name field with no remote, and says so", () => {
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(runsDir, { recursive: true, force: true });
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-project-sink-"));
    runsDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-project-runs-"));
    writeSessionStart({ projectId: "widgets", projectRemote: null });
    readAndStore();

    const records = storedRecords();
    assert.ok(records.length > 0);
    for (const record of records) {
      assert.equal(record.project_id, "widgets");
      assert.equal(record.project_field, "project_id");
    }
  });

  it("stores no project for a session with no journal entry at all", () => {
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(runsDir, { recursive: true, force: true });
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-project-sink-"));
    runsDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-project-runs-"));
    // No run file is ever written for CLAUDE_SESSION, so the sweep never reaches it -
    // named directly, the way the CLI already lets a person do.
    const result = spawnSync(process.execPath, [CLI, "read", "--session", CLAUDE_SESSION], {
      encoding: "utf8",
      env: { ...process.env, HOME: FIXTURES, PATH: "", AIDD_USER_CONFIG_DIR: configDir, AIDD_RUNS_DIR: runsDir },
    });
    assert.equal(result.status, 0, result.stderr);

    const records = storedRecords();
    assert.ok(records.length > 0);
    for (const record of records) {
      assert.ok(!("project_id" in record), "an unjournalled session must not be attributed a project");
      assert.ok(!("project_field" in record));
    }
  });
});

describe("breaking a period down by day and by project", () => {
  // The default period is 2026-08-17..2026-08-21, five UTC days inclusive.
  it("gives every day in the period a row, a gap included, and reconciles to the total", () => {
    const built = report({
      records: [
        request({ cost_usd: 1, event_timestamp: "2026-08-17T10:00:00Z" }),
        request({ cost_usd: 3, event_timestamp: "2026-08-19T10:00:00Z" }),
      ],
    });

    assert.deepEqual(
      built.byDays.map((row) => row.day),
      ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"],
    );
    const gap = built.byDays.find((row) => row.day === "2026-08-18");
    assert.deepEqual(gap.totals, { requests: 0 });

    const total = built.byDays.reduce((sum, row) => sum + (row.totals.costMicroUsd ?? 0), 0);
    assert.equal(total, built.totals.costMicroUsd);
  });

  it("prints a day with nothing as a row of zeros, never an omitted row", () => {
    const text = rendered(
      report({ records: [request({ cost_usd: 1, event_timestamp: "2026-08-17T10:00:00Z" })] }),
    );

    assert.match(text, /2026-08-18\s+nothing in this period/u);
  });

  it("gives a record with no project its own row, named as unknown", () => {
    const built = report({
      records: [
        request({ turn_id: "a", cost_usd: 2, project_id: "acme/widgets" }),
        request({ turn_id: "b", cost_usd: 1 }),
      ],
    });

    assert.equal(built.byProjects.length, 2);
    const unknown = built.byProjects.find((row) => row.project === undefined);
    assert.equal(unknown.totals.requests, 1);
    assert.equal(unknown.totals.costMicroUsd, toMicroUsd(1));

    const total = built.byProjects.reduce((sum, row) => sum + (row.totals.costMicroUsd ?? 0), 0);
    assert.equal(total, built.totals.costMicroUsd);
  });

  // An empty string is not a name - it is what a tool writes when it has none to give.
  // Mirrors cli/tests/domain/models/cost-report.unit.test.ts.
  it("treats an empty-string project_id the same as no project at all", () => {
    const built = report({
      records: [
        request({ turn_id: "a", cost_usd: 1, project_id: "acme/widgets" }),
        request({ turn_id: "b", cost_usd: 2, project_id: "" }),
        request({ turn_id: "c", cost_usd: 3 }),
      ],
    });

    assert.equal(built.byProjects.length, 2);
    const unknown = built.byProjects.find((row) => row.project === undefined);
    assert.equal(unknown.totals.requests, 2);
    assert.equal(unknown.totals.costMicroUsd, toMicroUsd(5));
  });

  it("never folds a record with no project into one that was actually placed", () => {
    const text = rendered(
      report({ records: [request({ project_id: "acme/widgets", cost_usd: 1 }), request({ cost_usd: 1 })] }),
    );

    assert.match(text, /no known project/u);
  });

  it("names how many days a long period carries, rather than printing every row", () => {
    const records = [];
    for (let i = 0; i < 40; i++) {
      records.push(request({ turn_id: `t-${i}`, cost_usd: 1, event_timestamp: `2026-01-${String((i % 27) + 1).padStart(2, "0")}T00:00:00Z` }));
    }
    const text = rendered(report({ fromDay: "2026-01-01", toDay: "2026-02-09", records }));

    assert.match(text, /40 days in this period/u);
    assert.match(text, /--json/u);
    assert.ok(!text.includes("2026-01-15"));
  });
});

describe("any dimension filters as well as it groups", () => {
  const AT = "2026-08-18T10:00:00Z";
  const WIDGETS = [
    request({ turn_id: "a", cost_usd: 1, model: "opus", step: "impl", step_attribution: "tool-stated", tool: "claude", project_id: "acme/widgets", event_timestamp: AT }),
    request({ turn_id: "b", cost_usd: 2, model: "sonnet", step: "review", step_attribution: "tool-stated", tool: "codex", project_id: "acme/widgets", event_timestamp: AT }),
  ];
  const GADGETS = [
    request({ turn_id: "c", cost_usd: 4, model: "opus", step: "impl", step_attribution: "tool-stated", tool: "claude", project_id: "acme/gadgets", event_timestamp: AT }),
  ];
  const declaredTools = [
    { tool: "claude", coverage: "covered", capability: NO_CAPABILITY },
    { tool: "codex", coverage: "covered", capability: NO_CAPABILITY },
  ];
  const known = {
    projects: new Set(["acme/widgets", "acme/gadgets"]),
    steps: new Set(["impl", "review"]),
    // "haiku" never appears on a WIDGETS/GADGETS record - known to the sweep (some record,
    // somewhere, once carried it) but idle in this selection, unlike "nobody-worked-here".
    models: new Set(["opus", "sonnet", "haiku"]),
  };

  function narrowed(overrides) {
    return report({ records: [...WIDGETS, ...GADGETS], declaredTools, knownValues: known, ...overrides });
  }

  it("keeps only the project asked for, the same as --project would", () => {
    const built = narrowed({ filters: { project: "acme/widgets" } });

    assert.equal(built.totals.requests, 2);
    assert.equal(built.totals.costMicroUsd, toMicroUsd(3));
  });

  it("keeps only the step, the model, or the tool asked for", () => {
    assert.equal(narrowed({ filters: { step: "impl" } }).totals.requests, 2);
    assert.equal(narrowed({ filters: { model: "sonnet" } }).totals.requests, 1);
    assert.equal(narrowed({ filters: { tool: "codex" } }).totals.requests, 1);
  });

  it("narrows two filters to their intersection, never their union", () => {
    const built = narrowed({ filters: { project: "acme/widgets", model: "opus" } });

    assert.equal(built.totals.requests, 1);
    assert.equal(built.totals.costMicroUsd, toMicroUsd(1));
  });

  it("says which selection it answered, in the header and the envelope", () => {
    const built = narrowed({ filters: { project: "acme/widgets", step: "impl" } });

    assert.deepEqual(built.filters, { project: "acme/widgets", step: "impl" });
    assert.match(rendered(built), /filters: project=acme\/widgets, step=impl/u);
    assert.deepEqual(toEnvelope(built).filters, { project: "acme/widgets", step: "impl" });
  });

  it("filtering and grouping on the same single-keyed dimension answers with one row", () => {
    const byProject = narrowed({ filters: { project: "acme/widgets" } });
    assert.equal(byProject.byProjects.length, 1);
    assert.equal(byProject.byProjects[0].project, "acme/widgets");

    const byModel = narrowed({ filters: { model: "opus" } });
    assert.equal(byModel.byModels.length, 1);

    // by_tool is a breakdown of every *declared* tool - a --tool filter has to narrow
    // that list too, or every excluded tool would still print a row reading "nothing in
    // this period", indistinguishable from one genuinely measured idle.
    const byTool = narrowed({ filters: { tool: "codex" } });
    assert.equal(byTool.byTools.length, 1);
    assert.equal(byTool.byTools[0].tool, "codex");
    assert.equal(byTool.byTools[0].totals.requests, 1);
  });

  it("filtering and grouping on step keeps one row per attribution strength, never merged", () => {
    const built = narrowed({
      filters: { step: "impl" },
      records: [
        ...WIDGETS,
        request({ turn_id: "d", cost_usd: 1, step: "impl", step_attribution: "journal-interval", project_id: "acme/widgets" }),
      ],
    });

    const implRows = built.bySteps.filter((row) => row.step === "impl");
    assert.equal(implRows.length, 2, "one row per attribution strength, both named 'impl'");
  });

  it("reconciles every breakdown to this selection's own total, exactly", () => {
    const built = narrowed({ filters: { project: "acme/widgets" } });
    const total = (rows) => rows.reduce((sum, row) => sum + row.totals.requests, 0);

    for (const rows of [built.bySteps, built.byModels, built.byProjects, built.byDays]) {
      assert.equal(total(rows), built.totals.requests);
    }
  });

  it("names the filter that emptied a selection a project nobody ever worked in", () => {
    const built = narrowed({ filters: { project: "nobody-worked-here" } });

    assert.deepEqual(built.emptySelection, { filter: "project", value: "nobody-worked-here", known: false });
    assert.match(rendered(built), /no record has ever named this project/u);
  });

  it("tells that empty apart from a known value with no work in this period", () => {
    const built = narrowed({ filters: { model: "haiku" } });

    assert.deepEqual(built.emptySelection, { filter: "model", value: "haiku", known: true });
    assert.match(rendered(built), /known, but no work here/u);
  });

  it("names the combination, not either filter alone, when both are real but their overlap is empty", () => {
    const built = narrowed({ filters: { project: "acme/gadgets", model: "sonnet" } });

    assert.deepEqual(built.emptySelection, { filter: "model", value: "sonnet", known: true, combination: true });
    assert.match(rendered(built), /combined with the rest of this selection/u);
  });

  it("never reports a filter as the culprit when the period itself has nothing", () => {
    const built = report({ fromDay: "2020-01-01", toDay: "2020-01-01", filters: { project: "acme/widgets" } });

    assert.equal(built.emptySelection, undefined);
  });

  it("drops a session-only figure a model or step filter cannot speak to, never as a false zero", () => {
    const sessionRecord = {
      kind: "session",
      vendor_id: "s-2",
      tool: "claude",
      provenance: "local-read",
      active_time_s: 30,
      project_id: "acme/widgets",
    };
    const withModel = narrowed({ filters: { model: "opus" }, records: [...WIDGETS, sessionRecord] });
    const withProject = narrowed({ filters: { project: "acme/widgets" }, records: [...WIDGETS, sessionRecord] });

    assert.equal(withModel.activeTimeSeconds, undefined);
    assert.equal(withProject.activeTimeSeconds, 30);
  });

  it("keeps a session-only figure under a step filter when a journal interval stamped one", () => {
    // Unlike model, a step can land on a session record: `telemetry-report.cjs`'s `store()`
    // runs `attribute()` over every record regardless of kind, so a session record whose
    // own moment falls inside a `step_start` interval carries `step` too.
    const sessionRecord = {
      kind: "session",
      vendor_id: "s-2",
      tool: "claude",
      provenance: "local-read",
      active_time_s: 30,
      project_id: "acme/widgets",
      step: "impl",
      step_attribution: "journal-interval",
    };

    const withStep = narrowed({ filters: { step: "impl" }, records: [...WIDGETS, sessionRecord] });
    const withOtherStep = narrowed({ filters: { step: "review" }, records: [...WIDGETS, sessionRecord] });

    assert.equal(withStep.activeTimeSeconds, 30);
    assert.equal(withOtherStep.activeTimeSeconds, undefined);
  });

  it("says a task or a tool was never seen without claiming a record check it never ran", () => {
    const unknownTool = narrowed({ filters: { tool: "opencode" } });
    assert.deepEqual(unknownTool.emptySelection, { filter: "tool", value: "opencode", known: false });
    assert.match(rendered(unknownTool), /it is not one of the tools this build knows/u);
    assert.ok(!rendered(unknownTool).includes("no record has ever named this tool"));
  });

  it("calls a zero row 'nothing in this selection', never 'this period', once a filter is active", () => {
    // Codex only appears on a widgets record - filtered to gadgets alone, its row and
    // that day's row are both zero, but the selection is why, not real idleness.
    const text = rendered(narrowed({ filters: { project: "acme/gadgets" } }));

    assert.match(text, /Codex\s+nothing in this selection/u);
    assert.match(text, /2026-08-1[0-9]\s+nothing in this selection/u);
    assert.ok(!text.includes("nothing in this period"));
  });

  it("still calls a zero row 'nothing in this period' when the whole period, not a filter, is why", () => {
    const text = rendered(report({ records: [] }));

    assert.match(text, /requests\s+nothing in this period/u);
    assert.ok(!text.includes("nothing in this selection"));
  });

  it("calls a task selection's own zero rows 'nothing in this selection' too", () => {
    const journal = { session: { vendor_id: "s-1" }, filesWritten: [{ path: "aidd_docs/tasks/2026_08/2026_08_01_x/plan.md" }] };
    const text = rendered(
      report({
        records: [request({ vendor_id: "s-1", cost_usd: 1, event_timestamp: "2026-08-17T10:00:00Z" })],
        journals: [journal],
        task: "2026_08/2026_08_01_x",
      }),
    );

    assert.match(text, /2026-08-18\s+nothing in this selection/u);
  });
});

describe("what a person reads", () => {
  it("answers the question before any breakdown is read", () => {
    const text = rendered(report({ records: [request({ cost_usd: 4.2, input_tokens: 100, cache_read_tokens: 900 })] }));

    assert.match(text, /tokens\s+1,000\s+90% cache/u);
    assert.match(text, /cost\s+\$4\.20/u);
  });

  it("says an amount is unknown rather than printing it as free", () => {
    const text = rendered(report({ records: [request({ tool: "codex", input_tokens: 10 })] }));

    assert.match(text, /amount unknown/u);
    assert.ok(!text.includes("$0.00"));
  });

  it("separates a tool that measured nothing from one nothing can read", () => {
    const text = rendered(
      report({
        records: [request({ cost_usd: 1 })],
        declaredTools: [
          { tool: "claude", coverage: "covered", capability: NO_CAPABILITY },
          { tool: "codex", coverage: "covered", capability: NO_CAPABILITY },
          { tool: "cursor", coverage: "not-covered", reason: "It writes no token count.", capability: NO_CAPABILITY },
        ],
      }),
    );

    assert.match(text, /Codex\s+nothing in this period/u);
    assert.match(text, /Cursor\s+not covered — It writes no token count\./u);
  });

  it("never restates unattributed as work that ran outside every step", () => {
    const text = rendered(report({ records: [request({ cost_usd: 1 })] }));

    assert.match(text, /unattributed/u);
    for (const forbidden of ["residual", "no step", "outside"]) {
      assert.ok(!text.includes(forbidden), forbidden);
    }
  });

  it("names a partial read before giving its total", () => {
    const text = rendered(report({ undatedRecords: 3, unreadableLines: 2 }));

    assert.match(text, /3 records carry no moment/u);
    assert.match(text, /2 lines could not be read/u);
  });
});

describe("what a program reads", () => {
  it("carries a version so an unrecognised shape can be refused", () => {
    assert.equal(toEnvelope(report()).cost_report_version, 3);
  });

  it("carries the period as it resolved, absolutely", () => {
    assert.deepEqual(toEnvelope(report()).period, { from_day: "2026-08-17", to_day: "2026-08-21" });
  });

  it("carries money as whole micro-dollars, so summing reports stays exact", () => {
    const envelope = toEnvelope(report({ records: [request({ cost_usd: 4.2 })] }));

    assert.equal(envelope.totals.cost_micro_usd, 4200000);
  });

  it("keeps an absent counter absent rather than turning it into a zero", () => {
    const envelope = toEnvelope(report({ records: [request({ input_tokens: 0 })] }));

    assert.equal(envelope.totals.input_tokens, 0);
    assert.ok(!("output_tokens" in envelope.totals));
  });

  it("carries how a ticket was known only alongside --task, never for an unfiltered period", () => {
    assert.ok(!("task_attribution" in toEnvelope(report())));

    const journals = [
      {
        session: { vendor_id: "s-1", tool: "codex" },
        filesWritten: [],
        boundaries: [{ type: "turn_end", at: "2026-08-17T11:00:00Z" }],
        taskDeclarations: [{ type: "task_declared", at: "2026-08-17T10:00:00Z", path: "aidd_docs/tasks/2026_08/t/spec.md" }],
      },
    ];
    const withTask = toEnvelope(
      report({
        journals,
        task: "2026_08/t",
        records: [request({ vendor_id: "s-1", cost_usd: 1, event_timestamp: "2026-08-17T10:30:00Z" })],
      }),
    );
    assert.deepEqual(
      withTask.task_attribution.map((row) => row.attribution),
      ["declared", "inferred"],
    );
    assert.equal(withTask.task_attribution[0].totals.requests, 1);
  });

  it("says what each tool can supply, so a limit is never read from a missing number", () => {
    const envelope = toEnvelope(
      report({
        declaredTools: [
          {
            tool: "claude",
            coverage: "covered",
            capability: {
              localRead: { tokenCounters: true, amount: false, toolStatedStep: true },
              export: null,
              journalAttributable: true,
              taskAttributable: true,
            },
          },
        ],
      }),
    );

    assert.deepEqual(envelope.by_tool[0].capability, {
      local_read: { token_counters: true, amount: false, tool_stated_step: true },
      export: null,
      journal_attributable: true,
      task_attributable: true,
    });
  });

  it("survives a round trip through JSON unchanged", () => {
    const envelope = toEnvelope(report());

    assert.deepEqual(JSON.parse(JSON.stringify(envelope)), envelope);
  });
});

// One axis, one artefact - and the assertion that matters most: not a spot check on a
// figure that happens to look right, but every figure in the artefact walked against the
// same envelope, in both directions, so neither invents a number nor drops a row.
describe("an artefact never disagrees with the envelope it came from", () => {
  const records = [
    request({
      turn_id: "a",
      cost_usd: 1.23,
      model: "opus",
      step: "impl",
      step_attribution: "tool-stated",
      project_id: "acme/widgets",
      input_tokens: 500,
      event_timestamp: "2026-08-17T10:00:00Z",
    }),
    request({
      turn_id: "b",
      cost_usd: 0.5,
      model: "haiku",
      tool: "codex",
      input_tokens: 200,
      event_timestamp: "2026-08-19T10:00:00Z",
    }),
  ];
  const declaredTools = [
    { tool: "claude", coverage: "covered", capability: NO_CAPABILITY },
    { tool: "codex", coverage: "covered", capability: NO_CAPABILITY },
    { tool: "cursor", coverage: "not-covered", reason: "It writes no token count.", capability: NO_CAPABILITY },
  ];

  // A whole-dollar figure at every stop keeps the assertion below exact: `toFixed(2)` and
  // `Number` agree without a rounding edge to reason about.
  const dollarsOf = (totals) => (totals.cost_micro_usd === undefined ? undefined : totals.cost_micro_usd / 1e6);
  const tokensOfRow = (totals) =>
    (totals.input_tokens ?? 0) +
    (totals.output_tokens ?? 0) +
    (totals.cache_read_tokens ?? 0) +
    (totals.cache_creation_tokens ?? 0);

  function assertRowWalks(artefact, totals) {
    if (totals.requests === 0) {
      assert.match(artefact, /nothing in this period/u);
      return;
    }
    const dollars = dollarsOf(totals);
    assert.match(artefact, dollars === undefined ? /amount unknown/u : new RegExp(`\\$${dollars.toFixed(2)}`, "u"));
    assert.match(artefact, new RegExp(`${tokensOfRow(totals).toLocaleString("en-US")} tokens`, "u"));
    assert.match(artefact, new RegExp(`${totals.requests.toLocaleString("en-US")} requests`, "u"));
  }

  it("states the period and the axis it came from", () => {
    const envelope = toEnvelope(report({ records, declaredTools }));
    for (const axis of ARTEFACT_AXES) {
      const artefact = buildArtefact(envelope, axis);
      assert.match(artefact, /^period 2026-08-17 to 2026-08-21 — axis: /u);
      assert.match(artefact, new RegExp(`axis: .*${axis === "total" ? "total" : axis}`, "u"));
    }
  });

  it("carries the total axis's one figure straight from totals, nothing summed twice", () => {
    const envelope = toEnvelope(report({ records, declaredTools }));
    assertRowWalks(buildArtefact(envelope, "total"), envelope.totals);
  });

  it("carries every day the period spans, a gap included, with no row invented or dropped", () => {
    const envelope = toEnvelope(report({ records, declaredTools }));
    const artefact = buildArtefact(envelope, "day");
    for (const row of envelope.by_day) {
      assert.match(artefact, new RegExp(`\\| ${row.day} \\|`, "u"));
      assertRowWalks(artefact, row.totals);
    }
  });

  it("keeps every day of a long period in a file artefact, unlike the terminal's cap", () => {
    const long = [];
    for (let i = 0; i < 40; i++) {
      long.push(
        request({ turn_id: `t-${i}`, cost_usd: 1, event_timestamp: `2026-01-${String((i % 27) + 1).padStart(2, "0")}T00:00:00Z` }),
      );
    }
    const envelope = toEnvelope(report({ fromDay: "2026-01-01", toDay: "2026-02-09", records: long }));
    const artefact = buildArtefact(envelope, "day");

    assert.equal(envelope.by_day.length, 40);
    for (const row of envelope.by_day) {
      assert.match(artefact, new RegExp(`\\| ${row.day} \\|`, "u"), `${row.day} missing from the file artefact`);
    }
  });

  it("gives every step, model, tool and project row its own line, walked against the envelope", () => {
    const envelope = toEnvelope(report({ records, declaredTools }));
    const axisRows = {
      step: envelope.by_step.map((row) => ({ name: row.step ?? "unattributed", totals: row.totals })),
      model: envelope.by_model.map((row) => ({ name: row.model, totals: row.totals })),
      project: envelope.by_project.map((row) => ({ name: row.project ?? "no known project", totals: row.totals })),
    };
    for (const [axis, rows] of Object.entries(axisRows)) {
      const artefact = buildArtefact(envelope, axis);
      assert.ok(rows.length > 0, `fixture must exercise ${axis}`);
      for (const row of rows) {
        assert.match(artefact, new RegExp(`\\| ${row.name} \\|`, "u"), `${axis} row '${row.name}' missing`);
        assertRowWalks(artefact, row.totals);
      }
    }
  });

  it("names a tool nothing can read by its declared reason, never as a zero", () => {
    const envelope = toEnvelope(report({ records, declaredTools }));
    const artefact = buildArtefact(envelope, "tool");

    assert.match(artefact, /Cursor \| not covered — It writes no token count\./u);
    assert.ok(!artefact.includes("$0.00"));
  });

  it("refuses an axis it does not know, naming the ones it does", () => {
    const envelope = toEnvelope(report({ records }));
    assert.throws(() => buildArtefact(envelope, "person"), /Unknown axis 'person'.*total, day, step, model, tool, project/u);
  });

  it("prints the axis artefact, never JSON, on the script's --axis path", () => {
    const { stdout } = runReportCli(["--axis", "day", "--from", "2026-08-17", "--to", "2026-08-19"]);

    assert.match(stdout, /^period 2026-08-17 to 2026-08-19 — axis: by day/u);
    assert.throws(() => JSON.parse(stdout), "the --axis path renders text, not an object");
  });
});

function runReportCli(args) {
  const CLI = path.join(SCRIPTS, "telemetry-report.cjs");
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-axis-sink-"));
  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-axis-runs-"));
  try {
    const result = spawnSync(process.execPath, [CLI, "report", ...args], {
      encoding: "utf8",
      env: { ...process.env, HOME: configDir, PATH: "", AIDD_USER_CONFIG_DIR: configDir, AIDD_RUNS_DIR: runsDir },
    });
    assert.equal(result.status, 0, result.stderr);
    return { stdout: result.stdout };
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(runsDir, { recursive: true, force: true });
  }
}

// Everything shipped elsewhere in this suite has met at most three sessions and a handful
// of day files. This builds a year of day files and a hundred journalled sessions - through
// sink.append() and record.cjs's own line builders, never a hand-written fixture - and asks
// the CLI the three questions a person actually runs: the period, the sweep, and one task's
// breakdown. Numbers: aidd_docs/tasks/2026_08/2026_08_21_telemetry-v1-close/measurements.md.
describe("a period that has met a hundred sessions", () => {
  const CLI = path.join(SCRIPTS, "telemetry-report.cjs");
  const NUM_SESSIONS = 100;
  const NUM_TASKS = 25;
  const NUM_DAYS = 365;
  const FROM_DAY = "2025-08-22";
  const TO_DAY = "2026-08-21";
  const START_MS = Date.parse(`${FROM_DAY}T12:00:00.000Z`);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SOURCES_CYCLE = ["tool-stated", "journal-interval", "unattributed"];
  const MODELS = ["opus", "sonnet", "haiku"];
  // Cycled across records, with every seventh carrying none at all - so the fixture proves
  // both a multi-project breakdown and the row a record with no project gets of its own.
  const PROJECTS = ["acme/widgets", "acme/gadgets"];
  const projectOfDay = (day) => (day % 7 === 0 ? null : PROJECTS[day % PROJECTS.length]);

  const sessionVendorId = (i) => `sess-${String(i).padStart(3, "0")}`;
  const taskIndexOfSession = (i) => i % NUM_TASKS;
  const taskPath = (taskIndex) => `aidd_docs/tasks/2026_08/2026_08_01_task-${taskIndex}/plan.md`;
  const taskId = (taskIndex) => `2026_08/2026_08_01_task-${taskIndex}`;

  let configDir;
  let runsDir;
  let homeDir;
  let previousEnv;
  let fixtureRecords;

  function writeJournals() {
    for (let i = 0; i < NUM_SESSIONS; i++) {
      const vendorId = sessionVendorId(i);
      const runId = generateUlid();
      const filePath = path.join(runsDir, runFileName(runId, vendorId));
      const at = new Date(START_MS).toISOString();
      appendLine(
        filePath,
        buildSessionStartLine({ at, runId, projectId: "acme/repo", projectRemote: null, host: "claude-code", vendorId }),
      );
      appendLine(
        filePath,
        buildFileWrittenLine({ at, path: taskPath(taskIndexOfSession(i)), source: "tool-stated" }),
      );
    }
  }

  function writeDayFiles() {
    const records = [];
    for (let day = 0; day < NUM_DAYS; day++) {
      const at = new Date(START_MS + day * DAY_MS);
      const attribution = SOURCES_CYCLE[day % SOURCES_CYCLE.length];
      const project = projectOfDay(day);
      const record = {
        sink_schema_version: 2,
        kind: "request",
        provenance: "local-read",
        tool: "claude",
        vendor_id: sessionVendorId(day % NUM_SESSIONS),
        event_timestamp: at.toISOString(),
        cost_usd: ((day % 23) + 1) / 100,
        input_tokens: 100 + day,
        model: MODELS[day % MODELS.length],
        step_attribution: attribution,
        ...(attribution === "unattributed" ? {} : { step: attribution === "tool-stated" ? "implement" : "review" }),
        ...(project === null ? {} : { project_id: project, project_field: "project_remote" }),
      };
      sink.append(record, at);
      records.push(record);
    }
    return records;
  }

  before(() => {
    previousEnv = { AIDD_USER_CONFIG_DIR: process.env.AIDD_USER_CONFIG_DIR, AIDD_RUNS_DIR: process.env.AIDD_RUNS_DIR };
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-year-sink-"));
    runsDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-year-runs-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-year-home-"));
    process.env.AIDD_USER_CONFIG_DIR = configDir;
    process.env.AIDD_RUNS_DIR = runsDir;

    writeJournals();
    fixtureRecords = writeDayFiles();
  });

  after(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(runsDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  // No git shellout in the read path of telemetry-report.cjs, so no repo needs setting up -
  // only readPeriod() and listJournals(), both of which already respect these two env vars.
  // HOME points at an empty directory and PATH is stripped so claudeRead, codexRead and
  // opencodeRead all fail fast rather than walking a real machine's session files, or - for
  // opencode - shelling out for real, a hundred times over.
  function runCli(args) {
    const startedAt = process.hrtime.bigint();
    const result = spawnSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      env: { ...process.env, HOME: homeDir, PATH: "", AIDD_USER_CONFIG_DIR: configDir, AIDD_RUNS_DIR: runsDir },
      timeout: 30_000,
    });
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    assert.equal(result.status, 0, `telemetry-report.cjs ${args.join(" ")} exited ${result.status}: ${result.stderr}`);
    return { stdout: result.stdout, elapsedMs };
  }

  const expectedMicroUsd = (records) => records.reduce((sum, r) => sum + toMicroUsd(r.cost_usd), 0);

  const reconciles = (built) => {
    const total = (rows) => rows.reduce((sum, row) => sum + (row.totals.cost_micro_usd ?? 0), 0);
    for (const rows of [built.by_step, built.by_model, built.by_project, built.by_day]) {
      assert.equal(total(rows), built.totals.cost_micro_usd);
    }
  };

  it("answers a period spanning a year of day files, and every breakdown reconciles to the total exactly", () => {
    const { stdout, elapsedMs } = runCli(["report", "--from", FROM_DAY, "--to", TO_DAY, "--json"]);
    console.log(`cost-report period over ${NUM_DAYS} day files, ${NUM_SESSIONS} sessions: ${elapsedMs.toFixed(1)}ms`);
    const envelope = JSON.parse(stdout);

    assert.equal(envelope.sessions, NUM_SESSIONS);
    assert.equal(envelope.totals.requests, NUM_DAYS);
    assert.equal(envelope.totals.cost_micro_usd, expectedMicroUsd(fixtureRecords));
    reconciles(envelope);

    // Every day the period spans, one row apiece - this fixture leaves no gap, so the
    // day-with-nothing case is proven separately, on a period small enough to read by eye.
    assert.equal(envelope.by_day.length, NUM_DAYS);
    assert.deepEqual(
      envelope.by_day.map((row) => row.day),
      [...envelope.by_day].map((row) => row.day).sort(),
    );

    // Two named projects, largest first, plus the row for what named none.
    const projectNames = envelope.by_project.map((row) => row.project);
    assert.deepEqual(projectNames.filter((name) => name !== undefined).sort(), [...PROJECTS].sort());
    assert.equal(projectNames.filter((name) => name === undefined).length, 1);
    const unknownProject = envelope.by_project.find((row) => row.project === undefined);
    const expectedUnknownRequests = fixtureRecords.filter((r) => r.project_id === undefined).length;
    assert.equal(unknownProject.totals.requests, expectedUnknownRequests);
  });

  it("keeps the year's daily breakdown out of the terminal, and says where to find it", () => {
    const { stdout } = runCli(["report", "--from", FROM_DAY, "--to", TO_DAY]);

    assert.match(stdout, new RegExp(`${NUM_DAYS} days in this period`));
    assert.match(stdout, /--json/u);
    // The header names the two boundary days; a day row for every day in between would
    // add 363 more YYYY-MM-DD occurrences the terminal was never asked to print.
    const dayLike = stdout.match(/\d{4}-\d{2}-\d{2}/gu) ?? [];
    assert.equal(dayLike.length, 2, dayLike.join(", "));
  });

  it("answers the session sweep, one journalled session at a time", () => {
    const { stdout, elapsedMs } = runCli(["read"]);
    console.log(`cost-report read sweep over ${NUM_SESSIONS} journalled sessions: ${elapsedMs.toFixed(1)}ms`);

    assert.match(stdout, new RegExp(`${NUM_SESSIONS} sessions read`));
  });

  it("answers one task's breakdown, reconciling to the total exactly", () => {
    const taskIndex = 0;
    const wanted = taskId(taskIndex);
    const wantedRecords = fixtureRecords.filter(
      (r) => taskIndexOfSession(Number(r.vendor_id.slice("sess-".length))) === taskIndex,
    );
    assert.ok(wantedRecords.length > 0, "fixture built no records for the task under test");

    const { stdout, elapsedMs } = runCli(["report", "--from", FROM_DAY, "--to", TO_DAY, "--task", wanted, "--json"]);
    console.log(`cost-report --task breakdown, ${wantedRecords.length} of ${NUM_DAYS} records: ${elapsedMs.toFixed(1)}ms`);
    const envelope = JSON.parse(stdout);

    assert.equal(envelope.task, wanted);
    assert.equal(envelope.totals.requests, wantedRecords.length);
    assert.equal(envelope.totals.cost_micro_usd, expectedMicroUsd(wantedRecords));
    reconciles(envelope);
  });

  it("answers a composed selection at the same volume, and every breakdown still reconciles", () => {
    const wanted = fixtureRecords.filter((r) => r.project_id === "acme/widgets" && r.model === "opus");
    assert.ok(wanted.length > 0, "fixture built no records for this composed selection");

    const { stdout, elapsedMs } = runCli([
      "report",
      "--from",
      FROM_DAY,
      "--to",
      TO_DAY,
      "--project",
      "acme/widgets",
      "--model",
      "opus",
      "--json",
    ]);
    console.log(`cost-report composed selection (project+model), ${wanted.length} of ${NUM_DAYS} records: ${elapsedMs.toFixed(1)}ms`);
    const envelope = JSON.parse(stdout);

    assert.deepEqual(envelope.filters, { project: "acme/widgets", model: "opus" });
    assert.equal(envelope.totals.requests, wanted.length);
    assert.equal(envelope.totals.cost_micro_usd, expectedMicroUsd(wanted));
    reconciles(envelope);
    // Filtering and grouping on the same dimension is one row, not an error, at this volume too.
    assert.equal(envelope.by_project.length, 1);
    assert.equal(envelope.by_model.length, 1);
  });

  it("names the filter responsible when a composed selection at this volume matches nothing", () => {
    const { stdout } = runCli([
      "report",
      "--from",
      FROM_DAY,
      "--to",
      TO_DAY,
      "--project",
      "never-worked-in-this-repo",
      "--json",
    ]);
    const envelope = JSON.parse(stdout);

    assert.deepEqual(envelope.empty_selection, {
      filter: "project",
      value: "never-worked-in-this-repo",
      known: false,
    });
    assert.equal(envelope.totals.requests, 0);
  });
});

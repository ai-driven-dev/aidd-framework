const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { describe, it, before, after } = require("node:test");

const SCRIPTS = path.resolve(__dirname, "../../plugins/aidd-telemetry/skills/01-cost/scripts");
const HOOKS_LIB = path.resolve(__dirname, "../../plugins/aidd-telemetry/hooks/lib");
const { buildIntervals, attribute } = require(path.join(SCRIPTS, "lib/attribution.js"));
const { build, taskOf, toMicroUsd } = require(path.join(SCRIPTS, "lib/report.js"));
const { printReport, toEnvelope } = require(path.join(SCRIPTS, "lib/render.js"));
const sink = require(path.join(SCRIPTS, "lib/sink.js"));
const { listJournals } = require(path.join(SCRIPTS, "lib/journal.js"));
const {
  buildSessionStartLine,
  buildFileWrittenLine,
  appendLine,
  runFileName,
  generateUlid,
} = require(path.join(HOOKS_LIB, "record.js"));

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
    assert.equal(toEnvelope(report()).cost_report_version, 1);
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

// Everything shipped elsewhere in this suite has met at most three sessions and a handful
// of day files. This builds a year of day files and a hundred journalled sessions - through
// sink.append() and record.js's own line builders, never a hand-written fixture - and asks
// the CLI the three questions a person actually runs: the period, the sweep, and one task's
// breakdown. Numbers: aidd_docs/tasks/2026_08/2026_08_21_telemetry-v1-close/measurements.md.
describe("a period that has met a hundred sessions", () => {
  const CLI = path.join(SCRIPTS, "telemetry-report.js");
  const NUM_SESSIONS = 100;
  const NUM_TASKS = 25;
  const NUM_DAYS = 365;
  const FROM_DAY = "2025-08-22";
  const TO_DAY = "2026-08-21";
  const START_MS = Date.parse(`${FROM_DAY}T12:00:00.000Z`);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SOURCES_CYCLE = ["tool-stated", "journal-interval", "unattributed"];
  const MODELS = ["opus", "sonnet", "haiku"];

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

  // No git shellout in the read path of telemetry-report.js, so no repo needs setting up -
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
    assert.equal(result.status, 0, `telemetry-report.js ${args.join(" ")} exited ${result.status}: ${result.stderr}`);
    return { stdout: result.stdout, elapsedMs };
  }

  const expectedMicroUsd = (records) => records.reduce((sum, r) => sum + toMicroUsd(r.cost_usd), 0);

  const reconciles = (built) => {
    const total = (rows) => rows.reduce((sum, row) => sum + (row.totals.cost_micro_usd ?? 0), 0);
    for (const rows of [built.by_step, built.by_model]) {
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
});

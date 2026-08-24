const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it, beforeEach, afterEach } = require("node:test");

const SCRIPTS = path.resolve(__dirname, "../../plugins/aidd-telemetry/skills/01-cost/scripts");
const SINK = path.join(SCRIPTS, "lib/sink.js");

/** The sink reads its directory from the environment at call time, so each test gets its
 * own and nothing is shared between them. `require` is re-run so the module picks it up. */
function freshSink(configDir) {
  process.env.AIDD_USER_CONFIG_DIR = configDir;
  delete require.cache[require.resolve(SINK)];
  return require(SINK);
}

const record = (overrides) => ({
  sink_schema_version: 2,
  kind: "request",
  provenance: "local-read",
  tool: "claude",
  vendor_id: "s-1",
  ...overrides,
});

describe("keeping records a session left behind", () => {
  let configDir;
  let previous;
  let sink;

  beforeEach(() => {
    previous = process.env.AIDD_USER_CONFIG_DIR;
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-sink-"));
    sink = freshSink(configDir);
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.AIDD_USER_CONFIG_DIR;
    else process.env.AIDD_USER_CONFIG_DIR = previous;
  });

  const store = (overrides, storedOn = "2026-08-21T09:00:00Z") =>
    sink.append(record(overrides), new Date(storedOn));

  const period = (from, to) => sink.readPeriod(from, to);

  it("selects on when the work ran, not on the day file it landed in", () => {
    // A session read days after it ran is appended to today's file while its records carry
    // their own, older moments. The file name says when we heard about the work.
    store({ vendor_id: "july", event_timestamp: "2026-07-29T10:00:00.000Z" });
    store({ vendor_id: "august", event_timestamp: "2026-08-18T10:00:00.000Z" });

    assert.deepEqual(
      period("2026-07-01", "2026-07-31").records.map((r) => r.vendor_id),
      ["july"],
    );
    assert.deepEqual(
      period("2026-08-01", "2026-08-31").records.map((r) => r.vendor_id),
      ["august"],
    );
  });

  it("places a moment written with a non-UTC offset on the day it happened", () => {
    // 01:00+05:00 on the 18th is 20:00 on the 17th, in UTC.
    store({ vendor_id: "offset", event_timestamp: "2026-08-18T01:00:00+05:00" });

    assert.equal(period("2026-08-17", "2026-08-17").records.length, 1);
    assert.equal(period("2026-08-18", "2026-08-18").records.length, 0);
  });

  it("hands back a record with no moment rather than placing it in a period", () => {
    // The only other moment available is the day the line was appended, which is a
    // different fact from when the work ran.
    store({ vendor_id: "dated", event_timestamp: "2026-08-17T10:00:00.000Z" });
    store({ vendor_id: "undated" });

    const read = period("2000-01-01", "2099-12-31");

    assert.deepEqual(read.records.map((r) => r.vendor_id), ["dated"]);
    assert.deepEqual(read.undated.map((r) => r.vendor_id), ["undated"]);
  });

  // A string merely shaped like a moment ("not-a-momentZ") is ten-or-more characters ending
  // in "Z" - the fast path `recordDayKey` takes for a real one. Answering a sliced fragment
  // there instead of `null` would place the record in whatever period happened to contain
  // that fragment, rather than handing it back undated the way a genuinely unparseable
  // moment already is above. Mirrors report.js's own `recordDayKey` and
  // cli/src/domain/models/telemetry-sink-record.ts's `telemetrySinkRecordDayKey`.
  it("hands back a record whose moment is merely shaped like one, undated - never a sliced fragment", () => {
    store({ vendor_id: "damaged", event_timestamp: "not-a-momentZ" });

    const read = period("2000-01-01", "2099-12-31");

    assert.deepEqual(read.records, []);
    assert.deepEqual(read.undated.map((r) => r.vendor_id), ["damaged"]);
  });

  it("keeps a day's other lines when one of them is torn", () => {
    store({ vendor_id: "whole", event_timestamp: "2026-08-17T10:00:00.000Z" });
    fs.appendFileSync(path.join(sink.rootDir(), "2026-08-21.jsonl"), '{"sink_schema_v');

    const read = period("2026-08-17", "2026-08-17");

    assert.deepEqual(read.records.map((r) => r.vendor_id), ["whole"]);
    assert.equal(read.skipped, 1);
  });

  it("sets aside a line of a schema this build does not know, and counts it", () => {
    store({ vendor_id: "known", event_timestamp: "2026-08-17T10:00:00.000Z" });
    fs.appendFileSync(
      path.join(sink.rootDir(), "2026-08-21.jsonl"),
      `${JSON.stringify(record({ sink_schema_version: 99, vendor_id: "future" }))}\n`,
    );

    const read = period("2026-08-17", "2026-08-17");

    assert.deepEqual(read.records.map((r) => r.vendor_id), ["known"]);
    assert.equal(read.skipped, 1);
  });

  it("finds one session's records across every day file", () => {
    store({ vendor_id: "wanted" }, "2026-08-20T09:00:00Z");
    store({ vendor_id: "wanted" }, "2026-08-21T09:00:00Z");
    store({ vendor_id: "other" }, "2026-08-21T09:00:00Z");

    assert.equal(sink.readForVendor("wanted").length, 2);
  });

  it("answers an empty period with nothing, never an error", () => {
    assert.deepEqual(period("2026-08-17", "2026-08-18"), {
      records: [],
      undated: [],
      skipped: 0,
      known: { projects: new Set(), steps: new Set(), models: new Set() },
    });
  });

  it("appends rather than rewriting, so a day's history only grows", () => {
    store({ vendor_id: "first" });
    const after = fs.readFileSync(path.join(sink.rootDir(), "2026-08-21.jsonl"), "utf8");
    store({ vendor_id: "second" });

    assert.ok(
      fs.readFileSync(path.join(sink.rootDir(), "2026-08-21.jsonl"), "utf8").startsWith(after),
    );
  });
});

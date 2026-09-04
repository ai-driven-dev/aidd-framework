import { appendFile, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TelemetrySinkPeriodRead } from "../../../../src/contexts/telemetry/domain/ports/telemetry-sink.js";
import type { TelemetrySinkRecord } from "../../../../src/contexts/telemetry/domain/telemetry-sink-record.js";
import { decideTelemetrySinkRetention } from "../../../../src/contexts/telemetry/domain/telemetry-sink-retention.js";
import { TelemetrySinkAdapter } from "../../../../src/contexts/telemetry/infrastructure/telemetry-sink-adapter.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";

const RECORD: TelemetrySinkRecord = {
  sink_schema_version: 2,
  kind: "request",
  provenance: "export",
  tool: "claude",
  vendor_id: "s-1",
  vendor_field: "session.id",
  cost_usd: 1,
  step_attribution: "unattributed",
};

describe("TelemetrySinkAdapter", () => {
  let userConfigDir: string;

  beforeEach(async () => {
    userConfigDir = await mkdtemp(join(tmpdir(), "aidd-sink-adapter-"));
  });

  afterEach(async () => {
    await rm(userConfigDir, { recursive: true, force: true });
  });

  it("writes under <userConfigDir>/telemetry, honoring the constructor override", () => {
    const adapter = new TelemetrySinkAdapter(userConfigDir);
    expect(adapter.rootDir).toBe(join(userConfigDir, "telemetry"));
  });

  it("appends real lines and reports whether the day file was just created", async () => {
    const adapter = new TelemetrySinkAdapter(userConfigDir);
    await adapter.ensureWritable();

    const first = await adapter.appendRecord(RECORD, new Date("2026-08-17T10:00:00Z"));
    expect(first.dayFileIsNew).toBe(true);

    const second = await adapter.appendRecord(RECORD, new Date("2026-08-17T11:00:00Z"));
    expect(second.dayFileIsNew).toBe(false);
    expect(second.filePath).toBe(first.filePath);

    const content = await readFile(first.filePath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "")).toEqual(RECORD);
  });

  it("never rewrites the file it appends to — appendRecord is the only write primitive", async () => {
    const adapter = new TelemetrySinkAdapter(userConfigDir);
    await adapter.ensureWritable();
    const { filePath } = await adapter.appendRecord(RECORD, new Date("2026-08-17T10:00:00Z"));
    const beforeStat = await readFile(filePath, "utf8");
    await adapter.appendRecord(RECORD, new Date("2026-08-17T12:00:00Z"));
    const afterStat = await readFile(filePath, "utf8");
    expect(afterStat.startsWith(beforeStat)).toBe(true);
  });

  it("prunes real day files beyond the window, keeping the newest, on real disk state", async () => {
    const adapter = new TelemetrySinkAdapter(userConfigDir);
    await adapter.ensureWritable();
    await adapter.appendRecord(RECORD, new Date("2026-08-15T10:00:00Z"));
    await adapter.appendRecord(RECORD, new Date("2026-08-16T10:00:00Z"));
    await adapter.appendRecord(RECORD, new Date("2026-08-17T10:00:00Z"));

    const before = await adapter.listDayFiles();
    expect(before).toEqual(["2026-08-15.jsonl", "2026-08-16.jsonl", "2026-08-17.jsonl"]);

    const { keep, prune } = decideTelemetrySinkRetention(before, 2);
    for (const fileName of prune) await adapter.deleteDayFile(adapter.rootDir, fileName);

    const after = await adapter.listDayFiles();
    expect(after).toEqual(keep);
    expect(after).toEqual(["2026-08-16.jsonl", "2026-08-17.jsonl"]);
  });

  it("finds a vendor's records across every day file, ignoring other vendors", async () => {
    const adapter = new TelemetrySinkAdapter(userConfigDir);
    await adapter.ensureWritable();
    const other = { ...RECORD, vendor_id: "s-2" };
    await adapter.appendRecord(RECORD, new Date("2026-08-15T10:00:00Z"));
    await adapter.appendRecord(other, new Date("2026-08-15T11:00:00Z"));
    await adapter.appendRecord(RECORD, new Date("2026-08-16T10:00:00Z"));

    const records = await adapter.readRecordsForVendor("s-1");
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.vendor_id === "s-1")).toBe(true);
  });

  it("skips a torn final line rather than failing the whole scan", async () => {
    const adapter = new TelemetrySinkAdapter(userConfigDir);
    await adapter.ensureWritable();
    const { filePath } = await adapter.appendRecord(RECORD, new Date("2026-08-15T10:00:00Z"));
    await appendFile(filePath, '{"sink_schema_version":2,"kind":"requ');

    const records = await adapter.readRecordsForVendor("s-1");
    expect(records).toHaveLength(1);
  });

  // chmod-based permission denial is meaningless for root (common in CI containers) and
  // for Windows ACLs — this project's CI matrix has neither, but the guard keeps the test
  // honest instead of silently passing on a platform where chmod doesn't block writes.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "fails ensureWritable at startup with a message naming the path, when the directory cannot be written",
    async () => {
      const adapter = new TelemetrySinkAdapter(userConfigDir);
      await adapter.ensureWritable(); // creates rootDir first
      await chmod(adapter.rootDir, 0o500);
      try {
        await expect(adapter.ensureWritable()).rejects.toThrow(adapter.rootDir);
      } finally {
        await chmod(adapter.rootDir, 0o700); // allow afterEach's rm to succeed
      }
    }
  );
});

describe("TelemetrySinkAdapter.readRecordsInPeriod", () => {
  let userConfigDir: string;
  let adapter: TelemetrySinkAdapter;

  // Every fixture below is appended on one day and stamped with another. That gap is the
  // whole point: a session read locally days after it ran lands in today's day file while
  // its records carry their own, older moments, and a report asking what last week cost
  // means the moment — not the day we happened to hear about it.
  const STORED_ON = new Date("2026-08-21T09:00:00Z");

  beforeEach(async () => {
    userConfigDir = await mkdtemp(join(tmpdir(), "aidd-sink-period-"));
    adapter = new TelemetrySinkAdapter(userConfigDir);
    await adapter.ensureWritable();
  });

  afterEach(async () => {
    await rm(userConfigDir, { recursive: true, force: true });
  });

  async function append(vendorId: string, happenedOn: string | undefined): Promise<void> {
    const record: TelemetrySinkRecord = {
      ...RECORD,
      vendor_id: vendorId,
      ...(happenedOn === undefined ? {} : { event_timestamp: `${happenedOn}T10:00:00.000Z` }),
    };
    await adapter.appendRecord(record, STORED_ON);
  }

  function period(from: string, to: string): Promise<TelemetrySinkPeriodRead> {
    return adapter.readRecordsInPeriod(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));
  }

  it("selects on when the work ran, not on the day file the line landed in", async () => {
    await append("july", "2026-07-29");
    await append("august", "2026-08-18");

    // Both were appended on 2026-08-21, so both live in the same day file.
    expect(await adapter.listDayFiles()).toEqual(["2026-08-21.jsonl"]);
    expect((await period("2026-07-01", "2026-07-31")).records.map((r) => r.vendor_id)).toEqual([
      "july",
    ]);
    expect((await period("2026-08-01", "2026-08-31")).records.map((r) => r.vendor_id)).toEqual([
      "august",
    ]);
  });

  it("returns every record inside the range and none outside it", async () => {
    await append("before", "2026-08-16");
    await append("first", "2026-08-17");
    await append("last", "2026-08-19");
    await append("after", "2026-08-20");

    const read = await period("2026-08-17", "2026-08-19");

    expect(read.records.map((record) => record.vendor_id)).toEqual(["first", "last"]);
    expect(read.skippedLines).toBe(0);
  });

  it("hands back a record with no moment rather than placing it in a period", async () => {
    await append("dated", "2026-08-17");
    await append("undated", undefined);

    const read = await period("2026-08-17", "2026-08-17");

    expect(read.records.map((record) => record.vendor_id)).toEqual(["dated"]);
    expect(read.undated.map((record) => record.vendor_id)).toEqual(["undated"]);
  });

  it("keeps a moment-less record out of every period, however wide", async () => {
    await append("undated", undefined);

    expect((await period("2000-01-01", "2099-12-31")).records).toEqual([]);
    expect((await period("2000-01-01", "2099-12-31")).undated).toHaveLength(1);
  });

  it("reads across sessions, unlike the per-vendor read it sits beside", async () => {
    await append("s-a", "2026-08-17");
    await append("s-b", "2026-08-17");

    const read = await period("2026-08-17", "2026-08-17");

    expect(read.records.map((record) => record.vendor_id)).toEqual(["s-a", "s-b"]);
    expect(await adapter.readRecordsForVendor("s-a")).toHaveLength(1);
  });

  it("skips a torn final line, keeps the file's other lines, and counts what it skipped", async () => {
    await append("whole", "2026-08-17");
    await appendFile(join(adapter.rootDir, "2026-08-21.jsonl"), '{"sink_schema_v');

    const read = await period("2026-08-17", "2026-08-17");

    expect(read.records.map((record) => record.vendor_id)).toEqual(["whole"]);
    expect(read.skippedLines).toBe(1);
  });

  it("skips a line whose schema version this build does not know, and says how many", async () => {
    await append("known", "2026-08-17");
    await appendFile(
      join(adapter.rootDir, "2026-08-21.jsonl"),
      `${JSON.stringify({ ...RECORD, sink_schema_version: 99, vendor_id: "future" })}\n`
    );

    const read = await period("2026-08-17", "2026-08-17");

    expect(read.records.map((record) => record.vendor_id)).toEqual(["known"]);
    expect(read.skippedLines).toBe(1);
  });

  it("places a moment written with a non-UTC offset on the day it actually happened", async () => {
    await adapter.appendRecord(
      // 2026-08-18T01:00+05:00 is 2026-08-17T20:00Z — the 17th, not the 18th.
      { ...RECORD, vendor_id: "offset", event_timestamp: "2026-08-18T01:00:00+05:00" },
      STORED_ON
    );

    expect((await period("2026-08-17", "2026-08-17")).records.map((r) => r.vendor_id)).toEqual([
      "offset",
    ]);
    expect((await period("2026-08-18", "2026-08-18")).records).toEqual([]);
  });

  it("reads the same period whichever way round the two days are given", async () => {
    await append("only", "2026-08-17");

    const forwards = await period("2026-08-16", "2026-08-18");
    const backwards = await adapter.readRecordsInPeriod(
      new Date("2026-08-18T00:00:00Z"),
      new Date("2026-08-16T00:00:00Z")
    );

    expect(backwards).toEqual(forwards);
  });

  it("answers an empty period with no records and nothing skipped, never an error", async () => {
    expect(await period("2026-08-17", "2026-08-18")).toEqual({
      records: [],
      undated: [],
      skippedLines: 0,
      knownValues: { projects: new Set(), steps: new Set(), models: new Set() },
    });
  });
});

describe("the real sink and its in-memory double place a record on the same day", () => {
  // A double that buckets differently from the adapter it stands for lets phase 2's
  // aggregation tests agree with the double and disagree with production. These are the
  // four shapes the two could diverge on.
  const MOMENTS: readonly (string | undefined)[] = [
    "2026-08-17T10:00:00.000Z",
    "2026-08-18T01:00:00+05:00",
    "not-a-moment",
    undefined,
  ];

  let userConfigDir: string;

  beforeEach(async () => {
    userConfigDir = await mkdtemp(join(tmpdir(), "aidd-sink-agree-"));
  });

  afterEach(async () => {
    await rm(userConfigDir, { recursive: true, force: true });
  });

  it("agrees on which records fall in a period and which carry no moment at all", async () => {
    const adapter = new TelemetrySinkAdapter(userConfigDir);
    await adapter.ensureWritable();
    const double = new InMemoryTelemetrySink();
    const storedOn = new Date("2026-08-21T09:00:00Z");

    for (const [index, at] of MOMENTS.entries()) {
      const record: TelemetrySinkRecord = {
        ...RECORD,
        vendor_id: `v-${index}`,
        ...(at === undefined ? {} : { event_timestamp: at }),
      };
      await adapter.appendRecord(record, storedOn);
      await double.appendRecord(record, storedOn);
    }

    const from = new Date("2026-08-17T00:00:00Z");
    const to = new Date("2026-08-17T00:00:00Z");
    const fromAdapter = await adapter.readRecordsInPeriod(from, to);
    const fromDouble = await double.readRecordsInPeriod(from, to);

    const ids = (read: TelemetrySinkPeriodRead) => ({
      records: read.records.map((r) => r.vendor_id),
      undated: read.undated.map((r) => r.vendor_id),
    });

    // v-0 is the 17th in UTC; v-1 is 01:00+05:00 on the 18th, which is the 17th in UTC.
    expect(ids(fromAdapter)).toEqual({ records: ["v-0", "v-1"], undated: ["v-2", "v-3"] });
    expect(ids(fromDouble)).toEqual(ids(fromAdapter));
  });

  // Finding 4's confinement, mirrored for the sink: `deleteDayFile` shares the same
  // `isBareFileName` check as `RunJournalReaderAdapter.deleteRunFile`.
  it("refuses a relative walk out of the directory it is handed, rather than deleting outside it", async () => {
    const adapter = new TelemetrySinkAdapter(userConfigDir);
    await adapter.ensureWritable();
    const victimPath = join(userConfigDir, "VICTIM.txt");
    await writeFile(victimPath, "do not delete me\n");

    // adapter.rootDir -> .. -> userConfigDir: "../VICTIM.txt" lands here.
    await expect(adapter.deleteDayFile(adapter.rootDir, "../VICTIM.txt")).rejects.toThrow();

    expect(await readFile(victimPath, "utf8")).toBe("do not delete me\n");
  });
});

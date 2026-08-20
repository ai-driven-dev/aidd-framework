import { appendFile, chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TelemetrySinkRecord } from "../../../src/domain/models/telemetry-sink-record.js";
import { decideTelemetrySinkRetention } from "../../../src/domain/models/telemetry-sink-retention.js";
import { TelemetrySinkAdapter } from "../../../src/infrastructure/adapters/telemetry-sink-adapter.js";

const RECORD: TelemetrySinkRecord = {
  sink_schema_version: 2,
  kind: "request",
  provenance: "export",
  vendor_id: "s-1",
  vendor_field: "session.id",
  cost_usd: 1,
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
    for (const fileName of prune) await adapter.deleteDayFile(fileName);

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

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELEMETRY_SINK_RETENTION_DAYS,
  decideTelemetrySinkRetention,
} from "../../../src/domain/models/telemetry-sink-retention.js";

describe("decideTelemetrySinkRetention()", () => {
  it("keeps the window's files and prunes the oldest, on real file names", () => {
    const files = ["2026-08-01.jsonl", "2026-08-02.jsonl", "2026-08-03.jsonl", "2026-08-04.jsonl"];
    const decision = decideTelemetrySinkRetention(files, 2);
    expect(decision.keep).toEqual(["2026-08-03.jsonl", "2026-08-04.jsonl"]);
    expect(decision.prune).toEqual(["2026-08-01.jsonl", "2026-08-02.jsonl"]);
  });

  it("defaults to a ninety-day window", () => {
    expect(DEFAULT_TELEMETRY_SINK_RETENTION_DAYS).toBe(90);
  });

  it("never prunes the newest file, even at a window of 0", () => {
    const files = ["2026-08-01.jsonl", "2026-08-02.jsonl", "2026-08-03.jsonl"];
    const decision = decideTelemetrySinkRetention(files, 0);
    expect(decision.keep).toEqual(["2026-08-03.jsonl"]);
    expect(decision.prune).not.toContain("2026-08-03.jsonl");
  });

  it("touches nothing when the sink is younger than the window", () => {
    const files = ["2026-08-03.jsonl", "2026-08-04.jsonl"];
    const decision = decideTelemetrySinkRetention(files, 90);
    expect(decision.keep).toEqual(files);
    expect(decision.prune).toEqual([]);
  });

  it("accepts files out of order and still sorts chronologically", () => {
    const files = ["2026-08-04.jsonl", "2026-08-01.jsonl", "2026-08-03.jsonl", "2026-08-02.jsonl"];
    const decision = decideTelemetrySinkRetention(files, 1);
    expect(decision.keep).toEqual(["2026-08-04.jsonl"]);
    expect(decision.prune).toEqual(["2026-08-01.jsonl", "2026-08-02.jsonl", "2026-08-03.jsonl"]);
  });
});

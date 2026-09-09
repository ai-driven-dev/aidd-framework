import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

/**
 * A record an earlier version of this tool wrote with `provenance: "export"` must stay
 * readable, countable and reportable: the writer is gone, the reader is not.
 */
const SINK_DAY_FILE = "2026-08-18.jsonl";
const WORK_DAY = "2026-08-18";

const STORED_EXPORT_RECORD = {
  sink_schema_version: 2,
  kind: "request",
  provenance: "export",
  tool: "claude",
  vendor_id: "7c53f826-fc3e-4729-8e2b-2cba887d3926",
  vendor_field: "session.id",
  turn_id: "a4b7b0b6-dc16-4889-b25a-def1d207aec9",
  turn_field: "prompt.id",
  step_attribution: "unattributed",
  project_id: "aidd-lab/telemetry-proof",
  billed_request_id: "req_011CeAaRe8Mm7oS7xvfjDPw8",
  cost_usd: 0.0132201,
  input_tokens: 2,
  output_tokens: 4,
  cache_read_tokens: 43847,
  cache_creation_tokens: 0,
  model: "claude-sonnet-5",
  event_timestamp: "2026-08-18T17:04:39.258Z",
} as const;

async function seedSink(fakeHome: string, records: readonly unknown[]): Promise<void> {
  const sinkDir = join(fakeHome, ".config", "aidd", "telemetry");
  await mkdir(sinkDir, { recursive: true });
  await writeFile(
    join(sinkDir, SINK_DAY_FILE),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf-8"
  );
}

function daysBackToTheWork(): string {
  const elapsed = Date.now() - Date.parse(`${WORK_DAY}T00:00:00Z`);
  return String(Math.ceil(elapsed / (24 * 60 * 60 * 1000)));
}

describe("a record the removed export route already wrote stays readable", () => {
  it("is counted by `aidd telemetry report`, with its own figures", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("stored-export-record");
    try {
      await gitInit(projectDir);
      await mkdir(join(projectDir, ".aidd"), { recursive: true });
      await writeFile(
        join(projectDir, ".aidd", "config.json"),
        JSON.stringify({ telemetry: { enabled: true } })
      );
      await seedSink(fakeHome, [STORED_EXPORT_RECORD]);

      const result = await runCli(
        ["telemetry", "report", "--days", daysBackToTheWork(), "--json"],
        projectDir,
        fakeHome
      );

      expect(result.exitCode, result.stderr).toBe(0);
      const envelope = JSON.parse(result.stdout);
      expect(envelope.totals.requests).toBe(1);
      expect(envelope.totals.input_tokens).toBe(2);
      expect(envelope.totals.output_tokens).toBe(4);
      expect(envelope.totals.cache_read_tokens).toBe(43847);
      // The one route that ever carried an amount — kept exactly as the stored line has it.
      expect(envelope.totals.cost_micro_usd).toBe(13220);
    } finally {
      await cleanup();
    }
  });

  it("counts once, not twice, when the same billed call also has a local-read sibling", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("stored-export-record-collapse");
    try {
      await gitInit(projectDir);
      await mkdir(join(projectDir, ".aidd"), { recursive: true });
      await writeFile(
        join(projectDir, ".aidd", "config.json"),
        JSON.stringify({ telemetry: { enabled: true } })
      );
      const localSibling = {
        sink_schema_version: 2,
        kind: "request",
        provenance: "local-read",
        tool: "claude",
        vendor_id: STORED_EXPORT_RECORD.vendor_id,
        vendor_field: "sessionId",
        turn_id: STORED_EXPORT_RECORD.billed_request_id,
        turn_field: "requestId",
        billed_request_id: STORED_EXPORT_RECORD.billed_request_id,
        step_attribution: "tool-stated",
        step: "aidd-dev:02-implement",
        input_tokens: STORED_EXPORT_RECORD.input_tokens,
        output_tokens: STORED_EXPORT_RECORD.output_tokens,
        model: STORED_EXPORT_RECORD.model,
        event_timestamp: STORED_EXPORT_RECORD.event_timestamp,
      };
      await seedSink(fakeHome, [STORED_EXPORT_RECORD, localSibling]);

      const result = await runCli(
        ["telemetry", "report", "--days", daysBackToTheWork(), "--json"],
        projectDir,
        fakeHome
      );

      expect(result.exitCode, result.stderr).toBe(0);
      const envelope = JSON.parse(result.stdout);
      // One billed call, seen by both routes, counts once — holding for an export-provenance
      // record read from disk.
      expect(envelope.totals.requests).toBe(1);
      expect(envelope.totals.input_tokens).toBe(2);
      expect(envelope.totals.cost_micro_usd).toBe(13220);
    } finally {
      await cleanup();
    }
  });
});

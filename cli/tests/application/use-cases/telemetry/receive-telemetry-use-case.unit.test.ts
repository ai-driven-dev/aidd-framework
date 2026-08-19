import { describe, expect, it } from "vitest";
// Side-effect imports: the use-case resolves each tool's export shape from the registry,
// so every AI tool must be registered for these tests to see Claude Code's declaration.
import "../../../../src/domain/tools/ai/claude.js";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/copilot.js";
import "../../../../src/domain/tools/ai/cursor.js";
import "../../../../src/domain/tools/ai/opencode.js";
import { ReceiveTelemetryUseCase } from "../../../../src/application/use-cases/telemetry/receive-telemetry-use-case.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";

function logsPayload(overrides: Record<string, unknown> = {}) {
  return {
    resourceLogs: [
      {
        resource: { attributes: [] },
        scopeLogs: [
          {
            logRecords: [
              {
                attributes: [
                  { key: "session.id", value: { stringValue: "s-1" } },
                  { key: "cost_usd", value: { doubleValue: 0.5 } },
                  { key: "model", value: { stringValue: "claude-sonnet-5" } },
                  ...Object.entries(overrides).map(([key, value]) => ({
                    key,
                    value:
                      typeof value === "string" ? { stringValue: value } : { doubleValue: value },
                  })),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function metricsPayload() {
  return {
    resourceMetrics: [
      {
        resource: { attributes: [] },
        scopeMetrics: [
          {
            metrics: [
              {
                name: "claude_code.active_time.total",
                sum: {
                  dataPoints: [
                    {
                      attributes: [{ key: "session.id", value: { stringValue: "s-1" } }],
                      asDouble: 9.714,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("ReceiveTelemetryUseCase.start()", () => {
  it("ensures the sink is writable and returns its root dir", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReceiveTelemetryUseCase(sink, new CapturingLogger());
    const result = await useCase.start();
    expect(result.rootDir).toBe(sink.rootDir);
  });

  it("propagates an unwritable sink so the caller never starts listening", async () => {
    const sink = new InMemoryTelemetrySink();
    sink.unwritable = true;
    const useCase = new ReceiveTelemetryUseCase(sink, new CapturingLogger());
    await expect(useCase.start()).rejects.toThrow();
  });
});

describe("ReceiveTelemetryUseCase.receive()", () => {
  it("maps a /v1/logs payload into a stored request line", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReceiveTelemetryUseCase(sink, new CapturingLogger());
    await useCase.receive("/v1/logs", logsPayload(), new Date("2026-08-19T10:00:00Z"));
    const [dayFile] = [...sink.files.values()];
    const [record] = dayFile ?? [];
    expect(record.kind).toBe("request");
    expect(record.vendor_id).toBe("s-1");
    expect(record.cost_usd).toBe(0.5);
  });

  it("maps a /v1/metrics payload into a stored session line, from the declared session measures", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReceiveTelemetryUseCase(sink, new CapturingLogger());
    await useCase.receive("/v1/metrics", metricsPayload(), new Date("2026-08-19T10:00:00Z"));
    const [dayFile] = [...sink.files.values()];
    const [record] = dayFile ?? [];
    expect(record.kind).toBe("session");
    expect(record.active_time_s).toBe(9.714);
  });

  it("accepts /v1/traces and stores nothing", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReceiveTelemetryUseCase(sink, new CapturingLogger());
    await useCase.receive("/v1/traces", { anything: true }, new Date());
    expect(sink.files.size).toBe(0);
  });

  it("never throws on a payload with the wrong shape, and stores nothing", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReceiveTelemetryUseCase(sink, new CapturingLogger());
    await expect(useCase.receive("/v1/logs", null, new Date())).resolves.toBeUndefined();
    await expect(useCase.receive("/v1/logs", "not an object", new Date())).resolves.toBeUndefined();
    expect(sink.files.size).toBe(0);
  });

  it("never throws on a metrics payload with the wrong shape, and stores nothing", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReceiveTelemetryUseCase(sink, new CapturingLogger());
    await expect(useCase.receive("/v1/metrics", null, new Date())).resolves.toBeUndefined();
    await expect(
      useCase.receive("/v1/metrics", "not an object", new Date())
    ).resolves.toBeUndefined();
    expect(sink.files.size).toBe(0);
  });

  it("prunes files beyond the window when a new day's file opens, keeping the payload that opened it", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReceiveTelemetryUseCase(sink, new CapturingLogger(), 1);

    await useCase.receive("/v1/logs", logsPayload(), new Date("2026-08-17T10:00:00Z"));
    await useCase.receive("/v1/logs", logsPayload(), new Date("2026-08-18T10:00:00Z"));

    expect(sink.deletedFiles).toEqual(["2026-08-17.jsonl"]);
    expect(sink.files.has("2026-08-18.jsonl")).toBe(true);
    expect(sink.files.get("2026-08-18.jsonl")).toHaveLength(1);
  });

  it("still stores the payload that opened a new day even when pruning fails", async () => {
    const sink = new InMemoryTelemetrySink();
    sink.files.set("2020-01-01.jsonl", []);
    sink.undeletable.add("2020-01-01.jsonl");
    const logger = new CapturingLogger();
    const useCase = new ReceiveTelemetryUseCase(sink, logger, 1);

    await useCase.receive("/v1/logs", logsPayload(), new Date("2026-08-18T10:00:00Z"));

    expect(sink.files.get("2026-08-18.jsonl")).toHaveLength(1);
    expect(sink.files.has("2020-01-01.jsonl")).toBe(true);
    expect(logger.warnMessages.some((m) => m.includes("could not delete"))).toBe(true);
  });

  // One file that cannot be deleted must not spare every older one behind it: it stays
  // the oldest candidate on every later rollover, so a batch-wide abort wedges pruning
  // for good and the sink grows without bound.
  it("deletes the files it can even when an older one refuses", async () => {
    const sink = new InMemoryTelemetrySink();
    for (const day of ["2020-01-01", "2020-01-02", "2020-01-03"]) {
      sink.files.set(`${day}.jsonl`, []);
    }
    sink.undeletable.add("2020-01-01.jsonl");
    const logger = new CapturingLogger();
    const useCase = new ReceiveTelemetryUseCase(sink, logger, 1);

    await useCase.receive("/v1/logs", logsPayload(), new Date("2026-08-18T10:00:00Z"));

    expect(sink.files.has("2020-01-01.jsonl")).toBe(true);
    expect(sink.deletedFiles).toEqual(["2020-01-02.jsonl", "2020-01-03.jsonl"]);
    expect(sink.files.get("2026-08-18.jsonl")).toHaveLength(1);
  });

  it("keeps two projects exporting to the same receiver separable by project_id", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReceiveTelemetryUseCase(sink, new CapturingLogger());
    const at = new Date("2026-08-19T10:00:00Z");

    await useCase.receive(
      "/v1/logs",
      logsPayload({ "session.id": "s-project-a", "aidd.project_id": "acme/project-a" }),
      at
    );
    await useCase.receive(
      "/v1/logs",
      logsPayload({ "session.id": "s-project-b", "aidd.project_id": "acme/project-b" }),
      at
    );

    const records = [...sink.files.values()].flat();
    expect(records).toHaveLength(2);
    const byProject = new Map(records.map((r) => [r.project_id, r]));
    expect(byProject.get("acme/project-a")?.vendor_id).toBe("s-project-a");
    expect(byProject.get("acme/project-b")?.vendor_id).toBe("s-project-b");
  });

  it("does not prune when the new day's file is the only one within the window", async () => {
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReceiveTelemetryUseCase(sink, new CapturingLogger(), 90);
    await useCase.receive("/v1/logs", logsPayload(), new Date("2026-08-19T10:00:00Z"));
    expect(sink.deletedFiles).toEqual([]);
  });
});

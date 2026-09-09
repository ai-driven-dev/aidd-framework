import { describe, expect, it } from "vitest";
import {
  type TelemetryRemovalPreview,
  telemetryRemovalIsEmpty,
} from "../../../../src/contexts/telemetry/domain/telemetry-removal.js";

function preview(overrides: Partial<TelemetryRemovalPreview> = {}): TelemetryRemovalPreview {
  return {
    journal: { scope: "project", path: "/repo/aidd_docs/runs", runFileNames: [] },
    sink: { scope: "machine", path: "/home/.config/aidd/telemetry", dayFileNames: [] },
    identity: {
      scope: "machine",
      path: "/home/.config/aidd/identity.json",
      present: false,
      unreadable: false,
    },
    history: { certainty: "possible" },
    ...overrides,
  };
}

describe("TelemetryRemovalPreview — a project's journal and a machine's records are never the same kind of thing", () => {
  it("names the journal as this project's own", () => {
    const result = preview();
    expect(result.journal.scope).toBe("project");
  });

  it("names the sink and the identity file as this machine's own", () => {
    const result = preview();
    expect(result.sink.scope).toBe("machine");
    expect(result.identity.scope).toBe("machine");
  });

  it("carries what cannot be reached beside what can, on the same value", () => {
    const result = preview({
      history: { certainty: "committed", files: ["aidd_docs/runs/x.jsonl"] },
    });
    expect(result.history.certainty).toBe("committed");
    // Not optional: a caller reading `result.journal` also has `result.history` in hand.
    expect(result).toHaveProperty("history");
  });
});

describe("telemetryRemovalIsEmpty()", () => {
  it("is empty when every location has nothing", () => {
    expect(telemetryRemovalIsEmpty(preview())).toBe(true);
  });

  it("is not empty when the journal holds a run file", () => {
    expect(
      telemetryRemovalIsEmpty(
        preview({
          journal: { scope: "project", path: "/repo/aidd_docs/runs", runFileNames: ["a.jsonl"] },
        })
      )
    ).toBe(false);
  });

  it("is not empty when the sink holds a day file", () => {
    expect(
      telemetryRemovalIsEmpty(
        preview({ sink: { scope: "machine", path: "/sink", dayFileNames: ["2026-08-20.jsonl"] } })
      )
    ).toBe(false);
  });

  it("is not empty when an identity is present, even if damaged", () => {
    expect(
      telemetryRemovalIsEmpty(
        preview({
          identity: { scope: "machine", path: "/identity.json", present: true, unreadable: true },
        })
      )
    ).toBe(false);
  });
});

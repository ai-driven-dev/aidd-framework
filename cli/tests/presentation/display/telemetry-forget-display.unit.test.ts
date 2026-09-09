import { describe, expect, it } from "vitest";
import type { TelemetryRemovalPreview } from "../../../src/contexts/telemetry/domain/telemetry-removal.js";
import {
  printTelemetryForgetPreview,
  printTelemetryForgetRefused,
  printTelemetryForgetResult,
} from "../../../src/presentation/display/telemetry-forget-display.js";
import { CLIOutput } from "../../../src/presentation/output.js";

class CapturingOutput extends CLIOutput {
  readonly lines: string[] = [];

  override print(message: string): void {
    this.lines.push(message);
  }
  override success(message: string): void {
    this.lines.push(message);
  }
  override warn(message: string): void {
    this.lines.push(message);
  }

  get text(): string {
    return this.lines.join("\n");
  }
}

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
    history: { certainty: "none" },
    ...overrides,
  };
}

describe("what a person is shown before anything is removed", () => {
  it("says there is nothing to remove when nothing was ever measured", () => {
    const output = new CapturingOutput();

    printTelemetryForgetPreview(output, preview());

    expect(output.text).toContain("Nothing to remove");
    expect(output.text).not.toContain("This would remove:");
  });

  // The sink is machine-wide while the journal is this project's, so removing "what this tool
  // measured" removes every project's figures — the sentence has to say so before `--yes`.
  it("says the stored records span every project measured on this machine", () => {
    const output = new CapturingOutput();

    printTelemetryForgetPreview(
      output,
      preview({
        sink: {
          scope: "machine",
          path: "/home/.config/aidd/telemetry",
          dayFileNames: ["2026-03-02.jsonl", "2026-03-03.jsonl"],
        },
      })
    );

    expect(output.text).toContain("every project measured on this machine");
    expect(output.text).toContain("2 day file(s)");
  });

  it("counts the run files it would remove, so the count can be checked afterwards", () => {
    const output = new CapturingOutput();

    printTelemetryForgetPreview(
      output,
      preview({
        journal: {
          scope: "project",
          path: "/repo/aidd_docs/runs",
          runFileNames: ["a.jsonl", "b.jsonl", "c.jsonl"],
        },
      })
    );

    expect(output.text).toContain("3 run file(s)");
  });

  // Git holds what git holds; removing local files does not reach it, and a person who
  // committed their journal has to learn that here rather than discover it later.
  it("names history that git already holds", () => {
    const output = new CapturingOutput();

    printTelemetryForgetPreview(
      output,
      preview({ history: { certainty: "committed", files: ["aidd_docs/runs/a.jsonl"] } })
    );

    expect(output.text).toContain("aidd_docs/runs/a.jsonl");
  });
});

describe("what a refusal says", () => {
  // Looking and deciding not to is not an error, and the sentence has to name the flag that
  // would have gone ahead.
  it("reports nothing removed and names the flag, never a failure", () => {
    const output = new CapturingOutput();

    printTelemetryForgetRefused(output);

    expect(output.text).toContain("Nothing removed");
    expect(output.text).toContain("--yes");
  });
});

describe("what is reported once it is done", () => {
  it("counts each location separately, so the three can be checked against the preview", () => {
    const output = new CapturingOutput();

    printTelemetryForgetResult(output, {
      journal: { removed: 3, failed: [] },
      sink: { removed: 2, failed: [] },
      identity: { removed: 1, failed: [] },
      history: { certainty: "none" },
    });

    expect(output.text).toContain("This project's run journal: 3 removed");
    expect(output.text).toContain("This machine's stored records: 2 removed");
    expect(output.text).toContain("This machine's identity: 1 removed");
  });

  // One undeletable file must not read as everything having gone.
  it("names every file it could not remove, and why", () => {
    const output = new CapturingOutput();

    printTelemetryForgetResult(output, {
      journal: { removed: 1, failed: [{ path: "b.jsonl", reason: "EACCES" }] },
      sink: { removed: 0, failed: [] },
      identity: { removed: 0, failed: [] },
      history: { certainty: "none" },
    });

    expect(output.text).toContain("1 could not be removed");
    expect(output.text).toContain("b.jsonl");
    expect(output.text).toContain("EACCES");
  });

  // Removing what was measured is not turning measurement off, and a person who wanted
  // both has to be told the switch is still where it was.
  it("says the switch was left alone, and how to turn measurement on again", () => {
    const output = new CapturingOutput();

    printTelemetryForgetResult(output, {
      journal: { removed: 0, failed: [] },
      sink: { removed: 0, failed: [] },
      identity: { removed: 0, failed: [] },
      history: { certainty: "none" },
    });

    expect(output.text).toContain("was not touched");
    expect(output.text).toContain("aidd telemetry on");
  });
});

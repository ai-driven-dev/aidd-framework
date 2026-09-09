import { describe, expect, it } from "vitest";
import type { TelemetryRemovalPreview } from "../../../src/contexts/telemetry/domain/telemetry-removal.js";
import {
  printTelemetryForgetPreview,
  printTelemetryForgetRefused,
  printTelemetryForgetResult,
} from "../../../src/presentation/display/telemetry-forget-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

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

const NOTHING_MEASURED =
  "AIDD telemetry: nothing was ever measured here — this project's journal, this machine's " +
  "stored records and this machine's identity are all already empty. Nothing to remove.";

const NO_REPOSITORY =
  "This project is not a git repository, so no history holds this project's run journal.";

function printedPreview(overrides: Partial<TelemetryRemovalPreview> = {}): string[] {
  const output = new CapturingOutput();
  printTelemetryForgetPreview(output, preview(overrides));
  return output.lines;
}

const ONE_RUN_FILE = {
  scope: "project",
  path: "/repo/aidd_docs/runs",
  runFileNames: ["a.jsonl"],
} as const;

describe("printTelemetryForgetPreview", () => {
  it("says nothing was ever measured, and lists nothing, when every location is empty", () => {
    expect(printedPreview()).toEqual([NOTHING_MEASURED, NO_REPOSITORY]);
  });

  it("names each location with its own path and count, machine scope spelled out", () => {
    expect(
      printedPreview({
        journal: {
          scope: "project",
          path: "/repo/aidd_docs/runs",
          runFileNames: ["a.jsonl", "b.jsonl", "c.jsonl"],
        },
        sink: {
          scope: "machine",
          path: "/home/.config/aidd/telemetry",
          dayFileNames: ["2026-03-02.jsonl", "2026-03-03.jsonl"],
        },
      })
    ).toEqual([
      "This would remove:",
      "  This project's run journal (/repo/aidd_docs/runs): 3 run file(s)",
      "  This machine's stored records — every project measured on this machine " +
        "(/home/.config/aidd/telemetry): 2 day file(s)",
      "  This machine's identity (/home/.config/aidd/identity.json): nothing to remove",
      NO_REPOSITORY,
    ]);
  });

  it("counts a present identity as one file", () => {
    expect(
      printedPreview({
        journal: ONE_RUN_FILE,
        identity: {
          scope: "machine",
          path: "/home/.config/aidd/identity.json",
          present: true,
          unreadable: false,
        },
      })[3]
    ).toBe("  This machine's identity (/home/.config/aidd/identity.json): 1 file");
  });

  it("says a damaged identity file will still go, rather than reading as absent", () => {
    expect(
      printedPreview({
        journal: ONE_RUN_FILE,
        identity: {
          scope: "machine",
          path: "/home/.config/aidd/identity.json",
          present: true,
          unreadable: true,
        },
      })[3]
    ).toBe(
      "  This machine's identity (/home/.config/aidd/identity.json): 1 file — present but " +
        "could not be read; will still be removed"
    );
  });
});

describe("printTelemetryForgetPreview — what removal cannot reach", () => {
  it("warns that a committed journal is certainly in history, and lists what is tracked", () => {
    expect(
      printedPreview({
        journal: ONE_RUN_FILE,
        history: {
          certainty: "committed",
          files: ["aidd_docs/runs/a.jsonl", "aidd_docs/runs/b.jsonl"],
        },
      }).at(-1)
    ).toBe(
      "Cannot be reached: this project's run journal has been committed, so git history " +
        "certainly holds it. Tracked right now:\n" +
        "  aidd_docs/runs/a.jsonl\n  aidd_docs/runs/b.jsonl\n" +
        "Removing it from the working tree does not remove it from history. No command here " +
        "rewrites git history."
    );
  });

  it("warns that a staged journal is not in history yet, and would come back on a commit", () => {
    expect(
      printedPreview({
        journal: ONE_RUN_FILE,
        history: { certainty: "staged", files: ["aidd_docs/runs/a.jsonl"] },
      }).at(-1)
    ).toBe(
      "Cannot be reached, not yet: this project's run journal is staged (tracked by git " +
        "right now) but has never been committed — history does not hold it yet:\n" +
        "  aidd_docs/runs/a.jsonl\n" +
        "The staged copy stays in git's index after this removal deletes the working-tree " +
        "file, so a later `git commit` with nothing further done would put it back. No " +
        "command here touches git's index or history."
    );
  });

  it("warns that an untracked journal may still have been committed before", () => {
    expect(
      printedPreview({ journal: ONE_RUN_FILE, history: { certainty: "possible" } }).at(-1)
    ).toBe(
      "Cannot be reached: this project's run journal is not tracked by git right now, but " +
        "history may still hold it if it was ever committed before — that cannot be told " +
        "apart from never having been committed. No command here rewrites git history."
    );
  });

  it("puts every history reading on stderr, never on the results channel", () => {
    const output = new CapturingOutput();

    printTelemetryForgetPreview(output, preview());

    expect(output.at("warn")).toEqual([NO_REPOSITORY]);
  });
});

describe("printTelemetryForgetRefused", () => {
  // Looking and deciding not to is not an error, and the sentence has to name the flag that
  // would have gone ahead.
  it("reports nothing removed and names the flag, never a failure", () => {
    const output = new CapturingOutput();

    printTelemetryForgetRefused(output);

    expect(output.lines).toEqual([
      "Nothing removed. Pass --yes to remove exactly what is listed above.",
    ]);
  });
});

describe("printTelemetryForgetResult", () => {
  it("counts each location separately, so the three can be checked against the preview", () => {
    const output = new CapturingOutput();

    printTelemetryForgetResult(output, {
      journal: { removed: 3, failed: [] },
      sink: { removed: 2, failed: [] },
      identity: { removed: 1, failed: [] },
      history: { certainty: "none" },
    });

    expect(output.lines).toEqual([
      "AIDD telemetry: removed",
      "  This project's run journal: 3 removed",
      "  This machine's stored records: 2 removed",
      "  This machine's identity: 1 removed",
      NO_REPOSITORY,
      "The telemetry switch (.aidd/config.json) was not touched — measurement can be turned " +
        "on again with `aidd telemetry on`.",
    ]);
  });

  // One undeletable file must not read as everything having gone.
  it("names every file it could not remove, under its own location's label", () => {
    const output = new CapturingOutput();

    printTelemetryForgetResult(output, {
      journal: { removed: 1, failed: [{ path: "b.jsonl", reason: "EACCES" }] },
      sink: { removed: 0, failed: [{ path: "2026-03-02.jsonl", reason: "EPERM" }] },
      identity: { removed: 0, failed: [{ path: "identity.json", reason: "EBUSY" }] },
      history: { certainty: "none" },
    });

    expect(output.lines.slice(1, 7)).toEqual([
      "  This project's run journal: 1 removed, 1 could not be removed",
      "  This machine's stored records: 0 removed, 1 could not be removed",
      "  This machine's identity: 0 removed, 1 could not be removed",
      "Could not remove journal run file b.jsonl — EACCES",
      "Could not remove sink day file 2026-03-02.jsonl — EPERM",
      "Could not remove identity file identity.json — EBUSY",
    ]);
  });

  it("says only what was removed when nothing failed", () => {
    const output = new CapturingOutput();

    printTelemetryForgetResult(output, {
      journal: { removed: 0, failed: [] },
      sink: { removed: 0, failed: [] },
      identity: { removed: 0, failed: [] },
      history: { certainty: "none" },
    });

    expect(output.lines[1]).toBe("  This project's run journal: 0 removed");
  });
});

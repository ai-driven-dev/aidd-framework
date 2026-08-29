import { describe, expect, it } from "vitest";
import {
  deriveProgressStatus,
  isProgressStatus,
  PROGRESS_STATUSES_IN_COLUMN_ORDER,
} from "../../src/domain/models/progress-status.js";

describe("deriveProgressStatus", () => {
  it("maps the raw status pending to the todo progress bucket", () => {
    expect(deriveProgressStatus("pending")).toBe("todo");
  });

  it("maps the kickoff raw statuses proposed, open and reported to the todo progress bucket", () => {
    expect(deriveProgressStatus("proposed")).toBe("todo");
    expect(deriveProgressStatus("open")).toBe("todo");
    expect(deriveProgressStatus("reported")).toBe("todo");
  });

  it("maps a terminal raw status like superseded to the unknown progress bucket", () => {
    expect(deriveProgressStatus("superseded")).toBe("unknown");
    expect(deriveProgressStatus("cancelled")).toBe("unknown");
  });

  it("maps the raw status in-progress to the in-progress progress bucket", () => {
    expect(deriveProgressStatus("in-progress")).toBe("in-progress");
  });

  it("maps the raw status done to the done progress bucket", () => {
    expect(deriveProgressStatus("done")).toBe("done");
  });

  it("maps the raw status implemented to the done progress bucket", () => {
    expect(deriveProgressStatus("implemented")).toBe("done");
  });

  it("maps the raw status reviewed to the done progress bucket", () => {
    expect(deriveProgressStatus("reviewed")).toBe("done");
  });

  it("maps the raw status blocked to its own blocked progress bucket", () => {
    expect(deriveProgressStatus("blocked")).toBe("blocked");
  });

  it("maps the unknown document status to the unknown progress bucket", () => {
    expect(deriveProgressStatus("unknown")).toBe("unknown");
  });

  it("maps an unrecognized raw status to the unknown progress bucket", () => {
    expect(deriveProgressStatus("something-unexpected")).toBe("unknown");
  });
});

describe("isProgressStatus", () => {
  it("returns true for every value in the column order", () => {
    for (const progressStatus of PROGRESS_STATUSES_IN_COLUMN_ORDER) {
      expect(isProgressStatus(progressStatus)).toBe(true);
    }
  });

  it("returns false for a value outside the progress bucket set", () => {
    expect(isProgressStatus("archived")).toBe(false);
  });
});

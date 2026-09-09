import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { COST_REPORT_ENVELOPE_VERSION } from "../../../../src/contexts/telemetry/domain/cost-report-envelope.js";
import { STEP_ATTRIBUTION_SOURCES } from "../../../../src/contexts/telemetry/domain/step-attribution.js";
import { TASK_UNATTRIBUTED_REASONS } from "../../../../src/contexts/telemetry/domain/task-attribution.js";
import { ARTEFACT_AXES } from "../../../../src/presentation/display/cost-report-artefact.js";
import { REPOSITORY_ROOT } from "../../../helpers/repository-root.js";

// Never a hand-maintained list on either side: only the code's own exported values and the
// document's own prose, both read fresh off disk.

const CONTRACT_DOC_URL = pathToFileURL(
  join(REPOSITORY_ROOT, "aidd_docs", "product", "cost-report-contract.md")
);

function contractText(): string {
  return readFileSync(fileURLToPath(CONTRACT_DOC_URL), "utf8");
}

describe("the cost report contract document", () => {
  it("names every reason a row with no task can carry", () => {
    const document = contractText();

    // Required as a table cell, not merely somewhere in the prose: a reason named only in a
    // version note is still missing from the table a reader parses against.
    const undocumented = TASK_UNATTRIBUTED_REASONS.filter(
      (reason) => !document.includes(`| \`"${reason}"\` |`)
    );

    expect(undocumented).toEqual([]);
  });

  // A journal file really can be read and still yield no session - `report-cost-use-case.ts`
  // drops one whose `session_start` header is torn - so the word this hinges on is "usable".
  it("never claims the unattributed reason means no journal existed", () => {
    const document = contractText();

    expect(document).not.toMatch(/no run journal was read for this record's session at all/i);
    expect(document).toContain("no usable run journal");
  });

  it("states the envelope version the code actually emits", () => {
    const stated = /Every object carries `cost_report_version`, currently `(\d+)`/.exec(
      contractText()
    );

    expect(stated?.[1]).toBe(String(COST_REPORT_ENVELOPE_VERSION));
  });

  // A reader parses against the worked example, so pinning only the prose sentence above it
  // guards the half nobody copies.
  it("shows that same version in its own worked example", () => {
    const shown = /"cost_report_version": (\d+)/.exec(contractText());

    expect(shown?.[1]).toBe(String(COST_REPORT_ENVELOPE_VERSION));
  });

  // The same drift the task-reason table already guards against: a source can join the
  // code's own fixed order and never join the table a reader parses `attribution` against.
  it("names every source a step's attribution can carry", () => {
    const document = contractText();

    const undocumented = STEP_ATTRIBUTION_SOURCES.filter(
      (source) => !document.includes(`| \`${source}\` |`)
    );

    expect(undocumented).toEqual([]);
  });

  // The quoted example in the `--axis` usage error is prose, not code - it drifts the same
  // way the worked example above does, silently, the moment a new axis is added.
  it("quotes the exact axis list --axis's own usage error prints", () => {
    const document = contractText();

    expect(document).toContain(ARTEFACT_AXES.join(", "));
  });
});

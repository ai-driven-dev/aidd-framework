import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COST_REPORT_ENVELOPE_VERSION } from "../../../src/domain/models/cost-report-envelope.js";
import { TASK_UNATTRIBUTED_REASONS } from "../../../src/domain/models/task-attribution.js";

// The same honesty check `metrics-contract.unit.test.ts` runs over the record: never a
// hand-maintained list on either side, only the code's own exported values and the
// document's own prose, both read fresh off disk. A reason a consumer can receive and the
// contract never names is a shape nobody can parse against.

const CONTRACT_DOC_URL = new URL(
  "../../../../aidd_docs/product/cost-report-contract.md",
  import.meta.url
);

function contractText(): string {
  return readFileSync(fileURLToPath(CONTRACT_DOC_URL), "utf8");
}

describe("the cost report contract document", () => {
  it("names every reason a row with no task can carry", () => {
    const document = contractText();

    // Required as a table cell, not merely somewhere in the prose: a reason can be named in
    // a version note and still be missing from the table a reader parses against, which is
    // exactly what happened while this document was being edited - the `"no-journal"` row
    // was clipped out of the table while three prose mentions kept a looser check green.
    const undocumented = TASK_UNATTRIBUTED_REASONS.filter(
      (reason) => !document.includes(`| \`"${reason}"\` |`)
    );

    expect(undocumented).toEqual([]);
  });

  // A journal file really can be read and still yield no session: `report-cost-use-case.ts`
  // drops one whose `session_start` header is torn (`if (!journal.session) return null`),
  // and the adapter's own "keeps a session's boundaries when its header line is torn" test
  // proves that shape reaches it. Those records land on this reason, so a document claiming
  // no journal was read "at all", or that nothing looked at what the session declared,
  // states something false about a case the code produces. The word this hinges on is
  // "usable".
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

  // The prose sentence above and the worked example below it drifted apart - the sentence
  // said 10 while the example still showed 8, two versions behind. A reader parses against
  // the example, so pinning only the sentence guards the half nobody copies.
  it("shows that same version in its own worked example", () => {
    const shown = /"cost_report_version": (\d+)/.exec(contractText());

    expect(shown?.[1]).toBe(String(COST_REPORT_ENVELOPE_VERSION));
  });
});

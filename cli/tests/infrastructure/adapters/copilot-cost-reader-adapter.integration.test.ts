import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CopilotCostReaderAdapter } from "../../../src/infrastructure/adapters/copilot-cost-reader-adapter.js";

// tests/fixtures/local-cost mirrors a real $HOME: .copilot/session-state/<id>/events.jsonl
// sits exactly where a real machine would write it, so pointing homeDir at this directory
// exercises the same path this reader builds against a real installation.
const HOME_DIR = fileURLToPath(new URL("../../fixtures/local-cost", import.meta.url)).replace(
  /\/$/,
  ""
);

const SESSION = "33333333-3333-4333-8333-333333333333";
const EMPTY_SESSION = "44444444-4444-4444-8444-444444444444";

describe("CopilotCostReaderAdapter", () => {
  const adapter = new CopilotCostReaderAdapter(HOME_DIR);

  it("reads one session record from its own events.jsonl, stamped with the id it was asked for", async () => {
    const { records, sessionFound } = await adapter.read(SESSION);

    expect(sessionFound).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]?.vendor_id).toBe(SESSION);
    expect(records[0]?.kind).toBe("session");
  });

  it("finds the session and reports it empty, not missing, when shutdown carried no tokenDetails", async () => {
    expect(await adapter.read(EMPTY_SESSION)).toEqual({ records: [], sessionFound: true });
  });

  it("says it found no session, not that the session cost nothing, when no directory names it", async () => {
    expect(await adapter.read("no-such-session")).toEqual({ records: [], sessionFound: false });
  });

  it("answers with nothing, not an error, when the declared home does not exist", async () => {
    const adapterWithNoHome = new CopilotCostReaderAdapter(`${HOME_DIR}/does-not-exist`);

    await expect(adapterWithNoHome.read(SESSION)).resolves.toEqual({
      records: [],
      sessionFound: false,
    });
  });
});

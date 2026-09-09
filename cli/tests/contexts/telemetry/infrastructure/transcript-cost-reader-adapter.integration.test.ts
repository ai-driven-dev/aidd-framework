import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createClaudeCodeTranscriptAccumulator } from "../../../../src/contexts/telemetry/domain/formats/claude-code-transcript.js";
import { createCodexRolloutAccumulator } from "../../../../src/contexts/telemetry/domain/formats/codex-rollout.js";
import { TranscriptCostReaderAdapter } from "../../../../src/contexts/telemetry/infrastructure/transcript-cost-reader-adapter.js";
import { CLAUDE_CODE_TRANSCRIPT_LOCATION } from "../../../../src/contexts/tools/domain/profiles/claude/claude-transcript-location.js";
import { CODEX_ROLLOUT_LOCATION } from "../../../../src/contexts/tools/domain/profiles/codex/codex-transcript-location.js";

// The fixtures tree mirrors a real $HOME, each tool's directory exactly where it would
// write it, so `homeDir` here exercises the same walk and file naming a real machine does.
const HOME_DIR = fileURLToPath(new URL("../../../fixtures/local-cost", import.meta.url)).replace(
  /\/$/,
  ""
);

const CLAUDE_SID = "22222222-2222-4222-8222-222222222222";
const CODEX_TARGET_ID = "019fae6f-2009-7cd3-86b2-b8f83481b160";
const CODEX_PARENT_ID = "019f69d0-9e1f-7951-86c9-ddb23cfd51f4";

describe("TranscriptCostReaderAdapter — Claude Code", () => {
  const adapter = new TranscriptCostReaderAdapter(
    HOME_DIR,
    CLAUDE_CODE_TRANSCRIPT_LOCATION,
    createClaudeCodeTranscriptAccumulator
  );

  it("reads both the main transcript and a subagent's own file for one session", async () => {
    const { records } = await adapter.read(CLAUDE_SID);

    // 3 real turns from the main transcript (one API call's two lines collapsed to one)
    // plus 1 from the subagent's own file.
    expect(records).toHaveLength(4);
    expect(records.filter((r) => r.agent_name === "Explore")).toHaveLength(1);
  });

  it("says it found no session, not that the session cost nothing, when no file names it", async () => {
    expect(await adapter.read("no-such-session")).toEqual({ records: [], sessionFound: false });
  });

  it("answers with nothing, not an error, when the declared root does not exist", async () => {
    const adapterWithNoHome = new TranscriptCostReaderAdapter(
      `${HOME_DIR}/does-not-exist`,
      CLAUDE_CODE_TRANSCRIPT_LOCATION,
      createClaudeCodeTranscriptAccumulator
    );

    await expect(adapterWithNoHome.read(CLAUDE_SID)).resolves.toEqual({
      records: [],
      sessionFound: false,
    });
  });
});

describe("TranscriptCostReaderAdapter — Codex", () => {
  const adapter = new TranscriptCostReaderAdapter(
    HOME_DIR,
    CODEX_ROLLOUT_LOCATION,
    createCodexRolloutAccumulator
  );

  it("resolves a resumed session by its own id, never its parent's, even with both on disk", async () => {
    const { records } = await adapter.read(CODEX_TARGET_ID);

    expect(records).toHaveLength(2);
    expect(records.every((r) => r.vendor_id === CODEX_TARGET_ID)).toBe(true);
  });

  it("resolves the parent's own session independently, not the resumed session's records", async () => {
    const { records } = await adapter.read(CODEX_PARENT_ID);

    expect(records).toHaveLength(1);
    expect(records[0]?.vendor_id).toBe(CODEX_PARENT_ID);
    expect(records[0]?.turn_id).toBe("019f69d1-8dcc-7272-a9eb-523ef9976475");
  });

  it("says it found no session for an id no rollout file names", async () => {
    expect(await adapter.read("no-such-session")).toEqual({ records: [], sessionFound: false });
  });

  it("finds the resumed session, so a report never reads 38% of Codex sessions as absent", async () => {
    // The trap this guards: the journal hook and this reader must name a resumed session
    // the same way. 124 of 330 rollouts measured on one machine are resumed.
    expect((await adapter.read(CODEX_TARGET_ID)).sessionFound).toBe(true);
  });
});

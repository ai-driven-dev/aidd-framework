import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLAUDE_CODE_TRANSCRIPT_LOCATION,
  createClaudeCodeTranscriptAccumulator,
} from "../../../src/domain/formats/claude-code-transcript.js";
import {
  CODEX_ROLLOUT_LOCATION,
  createCodexRolloutAccumulator,
} from "../../../src/domain/formats/codex-rollout.js";
import { TranscriptCostReaderAdapter } from "../../../src/infrastructure/adapters/transcript-cost-reader-adapter.js";

// The fixtures tree under tests/fixtures/local-cost mirrors a real $HOME: `.claude/projects`
// and `.codex/sessions` sit exactly where each tool would write them, so pointing `homeDir`
// at this directory exercises the same directory walk and file naming a real machine would.
const HOME_DIR = fileURLToPath(new URL("../../fixtures/local-cost", import.meta.url)).replace(
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
    const records = await adapter.read(CLAUDE_SID);

    // 3 real turns from the main transcript (one API call's two lines collapsed to one)
    // plus 1 from the subagent's own file.
    expect(records).toHaveLength(4);
    expect(records.filter((r) => r.agent_name === "Explore")).toHaveLength(1);
  });

  it("answers with nothing for a session neither file was written for", async () => {
    const records = await adapter.read("no-such-session");

    expect(records).toEqual([]);
  });

  it("answers with nothing, not an error, when the declared root does not exist", async () => {
    const adapterWithNoHome = new TranscriptCostReaderAdapter(
      `${HOME_DIR}/does-not-exist`,
      CLAUDE_CODE_TRANSCRIPT_LOCATION,
      createClaudeCodeTranscriptAccumulator
    );

    await expect(adapterWithNoHome.read(CLAUDE_SID)).resolves.toEqual([]);
  });
});

describe("TranscriptCostReaderAdapter — Codex", () => {
  const adapter = new TranscriptCostReaderAdapter(
    HOME_DIR,
    CODEX_ROLLOUT_LOCATION,
    createCodexRolloutAccumulator
  );

  it("resolves a resumed session by its own id, never its parent's, even with both on disk", async () => {
    const records = await adapter.read(CODEX_TARGET_ID);

    expect(records).toHaveLength(2);
    expect(records.every((r) => r.vendor_id === CODEX_TARGET_ID)).toBe(true);
  });

  it("resolves the parent's own session independently, not the resumed session's records", async () => {
    const records = await adapter.read(CODEX_PARENT_ID);

    expect(records).toHaveLength(1);
    expect(records[0]?.vendor_id).toBe(CODEX_PARENT_ID);
    expect(records[0]?.turn_id).toBe("019f69d1-8dcc-7272-a9eb-523ef9976475");
  });

  it("answers with nothing for a session no rollout file names", async () => {
    const records = await adapter.read("no-such-session");

    expect(records).toEqual([]);
  });
});

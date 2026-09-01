import { describe, expect, it } from "vitest";
import {
  CLAUDE_PLUGIN_ROOT_TOKEN,
  rewritePluginRootToken,
} from "../../../src/domain/formats/plugin-root-token-rewrite.js";

// Avoid biome noTemplateCurlyInString: split literals
const CLAUDE_TOKEN = "$" + "{CLAUDE_PLUGIN_ROOT}";
const CURSOR_TOKEN = "$" + "{CURSOR_PLUGIN_ROOT}";
const CODEX_TOKEN = "$" + "{PLUGIN_ROOT}";
const COPILOT_TOKEN = "$" + "{COPILOT_PLUGIN_ROOT}";

describe("rewritePluginRootToken", () => {
  describe("claude no-op (token equals source)", () => {
    it("returns content unchanged when target equals the source token", () => {
      const content = `node ${CLAUDE_TOKEN}/hooks/update.js`;
      expect(rewritePluginRootToken(content, CLAUDE_TOKEN)).toBe(content);
    });

    it("returns the exact same string reference (no copy)", () => {
      const content = `node ${CLAUDE_TOKEN}/hooks/update.js`;
      const result = rewritePluginRootToken(content, CLAUDE_TOKEN);
      expect(result).toBe(content);
    });
  });

  describe("cursor substitution", () => {
    it("rewrites the claude token to the cursor native token", () => {
      const content = `node ${CLAUDE_TOKEN}/hooks/update.js`;
      const result = rewritePluginRootToken(content, CURSOR_TOKEN);
      expect(result).toBe(`node ${CURSOR_TOKEN}/hooks/update.js`);
    });

    it("preserves path separator after token", () => {
      const content = `${CLAUDE_TOKEN}/hooks/check.sh`;
      const result = rewritePluginRootToken(content, CURSOR_TOKEN);
      expect(result).toContain(`${CURSOR_TOKEN}/hooks/`);
    });

    it("does not contain the claude token after rewrite", () => {
      const content = `${CLAUDE_TOKEN}/hooks/check.sh`;
      const result = rewritePluginRootToken(content, CURSOR_TOKEN);
      expect(result).not.toContain(CLAUDE_TOKEN);
    });

    it("rewrites all occurrences in content", () => {
      const content = `${CLAUDE_TOKEN}/hooks/a.sh and ${CLAUDE_TOKEN}/hooks/b.sh`;
      const result = rewritePluginRootToken(content, CURSOR_TOKEN);
      expect(result).toBe(`${CURSOR_TOKEN}/hooks/a.sh and ${CURSOR_TOKEN}/hooks/b.sh`);
    });
  });

  describe("codex substitution", () => {
    it("rewrites the claude token to the codex native token", () => {
      const content = `"command": "${CLAUDE_TOKEN}/hooks/update.js"`;
      const result = rewritePluginRootToken(content, CODEX_TOKEN);
      expect(result).toBe(`"command": "${CODEX_TOKEN}/hooks/update.js"`);
    });

    it("preserves path separator after token", () => {
      const content = `${CLAUDE_TOKEN}/hooks/run.sh`;
      const result = rewritePluginRootToken(content, CODEX_TOKEN);
      expect(result).toContain(`${CODEX_TOKEN}/hooks/`);
    });
  });

  describe("copilot substitution", () => {
    it("rewrites the claude token to the copilot native token", () => {
      const content = `"command": "${CLAUDE_TOKEN}/hooks/check.sh"`;
      const result = rewritePluginRootToken(content, COPILOT_TOKEN);
      expect(result).toBe(`"command": "${COPILOT_TOKEN}/hooks/check.sh"`);
    });

    it("preserves path separator after token", () => {
      const content = `${CLAUDE_TOKEN}/bin/server.js`;
      const result = rewritePluginRootToken(content, COPILOT_TOKEN);
      expect(result).toContain(`${COPILOT_TOKEN}/bin/`);
    });
  });

  describe("scope guard — other env variables are untouched", () => {
    it("leaves ISSUE_NUMBER unchanged", () => {
      const issueVar = "$" + "{ISSUE_NUMBER}";
      const content = `${CLAUDE_TOKEN}/hooks/check.sh ${issueVar}`;
      const result = rewritePluginRootToken(content, CURSOR_TOKEN);
      expect(result).toContain(issueVar);
    });

    it("leaves CLAUDE_SESSION_ID unchanged", () => {
      const sessionVar = "$" + "{CLAUDE_SESSION_ID}";
      const content = `${CLAUDE_TOKEN}/hooks/a.sh ${sessionVar}`;
      const result = rewritePluginRootToken(content, CURSOR_TOKEN);
      expect(result).toContain(sessionVar);
    });

    it("leaves RUNNER_TEMP unchanged", () => {
      const runnerVar = "$" + "{RUNNER_TEMP}";
      const content = `${CLAUDE_TOKEN}/hooks/a.sh ${runnerVar}`;
      const result = rewritePluginRootToken(content, CODEX_TOKEN);
      expect(result).toContain(runnerVar);
    });

    it("leaves CLAUDE_EFFORT unchanged", () => {
      const effortVar = "$" + "{CLAUDE_EFFORT}";
      const content = `${CLAUDE_TOKEN}/hooks/a.sh ${effortVar}`;
      const result = rewritePluginRootToken(content, COPILOT_TOKEN);
      expect(result).toContain(effortVar);
    });
  });

  describe("content without the source token", () => {
    it("returns content unchanged when token is absent", () => {
      const content = '{"command": "node ./hooks/update.js"}';
      expect(rewritePluginRootToken(content, CURSOR_TOKEN)).toBe(content);
    });

    it("returns empty string unchanged", () => {
      expect(rewritePluginRootToken("", CURSOR_TOKEN)).toBe("");
    });
  });

  describe("CLAUDE_PLUGIN_ROOT_TOKEN constant", () => {
    it("exported constant matches the canonical source token", () => {
      expect(CLAUDE_PLUGIN_ROOT_TOKEN).toBe(CLAUDE_TOKEN);
    });
  });
});

describe("per-tool pluginRootToken contract values", () => {
  it("claude contract uses the claude native token", async () => {
    const { buildClaudeContract } = await import(
      "../../../src/contexts/tools/domain/profiles/claude/build.js"
    );
    expect(buildClaudeContract().pluginRootToken).toBe(CLAUDE_TOKEN);
  });

  it("cursor contract uses the cursor native token", async () => {
    const { buildCursorContract } = await import(
      "../../../src/contexts/tools/domain/profiles/cursor/build.js"
    );
    expect(buildCursorContract().pluginRootToken).toBe(CURSOR_TOKEN);
  });

  it("codex contract uses the codex native token", async () => {
    const { buildCodexContract } = await import(
      "../../../src/contexts/tools/domain/profiles/codex/build.js"
    );
    expect(buildCodexContract().pluginRootToken).toBe(CODEX_TOKEN);
  });

  it("copilot marketplace contract uses the OpenPlugin native token", async () => {
    const { buildCopilotMarketplaceContract } = await import(
      "../../../src/contexts/tools/domain/profiles/copilot/build.js"
    );
    expect(buildCopilotMarketplaceContract().pluginRootToken).toBe(CODEX_TOKEN);
  });

  it("flat contracts do not set pluginRootToken", async () => {
    const { buildClaudeFlatContract } = await import(
      "../../../src/contexts/tools/domain/profiles/claude/build.js"
    );
    const { buildCursorFlatContract } = await import(
      "../../../src/contexts/tools/domain/profiles/cursor/build.js"
    );
    const { buildCopilotFlatContract } = await import(
      "../../../src/contexts/tools/domain/profiles/copilot/build.js"
    );
    const { buildCodexFlatContract } = await import(
      "../../../src/contexts/tools/domain/profiles/codex/build.js"
    );
    expect(buildClaudeFlatContract().pluginRootToken).toBeUndefined();
    expect(buildCursorFlatContract().pluginRootToken).toBeUndefined();
    expect(buildCopilotFlatContract().pluginRootToken).toBeUndefined();
    expect(buildCodexFlatContract().pluginRootToken).toBeUndefined();
  });
});

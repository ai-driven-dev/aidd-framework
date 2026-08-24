import { describe, expect, it } from "vitest";
import {
  buildClaudeContract,
  buildCodexContract,
  buildCopilotMarketplaceContract,
  buildCursorContract,
} from "../../../src/application/use-cases/framework/strategies/tool-contracts.js";
import { rewritePluginRootToken } from "../../../src/domain/formats/plugin-root-token-rewrite.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../src/domain/models/tool-ids.js";
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import "../../../src/domain/tools/ai/copilot.js";
import "../../../src/domain/tools/ai/cursor.js";
import "../../../src/domain/tools/ai/opencode.js";
import type { PluginsCapability } from "../../../src/domain/capabilities/plugins-capability.js";
import { getAiToolConfig } from "../../../src/domain/tools/registry.js";

/**
 * A hook whose command names a variable the host does not expand installs cleanly, runs on
 * every event, and silently does nothing. That is how it went unnoticed on three tools, so
 * the variable each one expands is declared beside the rest of what that tool supports —
 * and these hold the two install routes to that single declaration.
 */

const CONTRACTS: ReadonlyArray<[AiToolId, () => { pluginRootToken?: string | null }]> = [
  ["claude", buildClaudeContract],
  ["cursor", buildCursorContract],
  ["copilot", buildCopilotMarketplaceContract],
  ["codex", buildCodexContract],
];

function pluginsOf(tool: AiToolId): PluginsCapability | undefined {
  const capabilities = getAiToolConfig(tool).capabilities as { plugins?: PluginsCapability };
  return capabilities.plugins;
}

describe("which variable a tool expands to its installed plugin's directory", () => {
  it("declares one for every tool that hosts a plugin as its own directory", () => {
    let examined = 0;
    for (const tool of AI_TOOL_IDS) {
      const plugins = pluginsOf(tool);
      if (plugins?.mode !== "native") continue;
      examined++;
      expect(plugins.pluginRootToken, tool).toBeTruthy();
    }
    // A tool list that stopped naming any native-mode tool would pass by never reaching
    // the assertion above, which is the failure shape this whole file exists to catch.
    expect(examined).not.toBe(0);
  });

  it("declares none for a tool with no plugin directory to point at", () => {
    let examined = 0;
    for (const tool of AI_TOOL_IDS) {
      const plugins = pluginsOf(tool);
      if (!plugins || plugins.mode === "native") continue;
      examined++;
      expect(plugins.pluginRootToken, tool).toBeNull();
    }
    expect(examined).not.toBe(0);
  });

  // The state this ticket existed to remove: a tool that declares the variable it expands
  // and still does not receive the hooks that would use it.
  it("pairs the declaration with actually receiving hooks", () => {
    let examined = 0;
    for (const tool of AI_TOOL_IDS) {
      const plugins = pluginsOf(tool);
      if (plugins?.mode !== "native") continue;
      examined++;
      expect(Boolean(plugins.pluginRootToken), tool).toBe(plugins.acceptsHooks);
    }
    expect(examined).not.toBe(0);
  });

  it("names a variable a host can expand, never a path", () => {
    let examined = 0;
    for (const tool of AI_TOOL_IDS) {
      const token = pluginsOf(tool)?.pluginRootToken;
      if (token === null || token === undefined) continue;
      examined++;
      expect(token, tool).toMatch(/^\$\{[A-Z_]+\}$/u);
    }
    expect(examined).not.toBe(0);
  });
});

describe("the route that builds a marketplace bundle", () => {
  // Two places naming the same variable is how they start disagreeing, and the failure
  // would be silent on the side nobody looks at.
  it("substitutes the token the tool itself declared", () => {
    for (const [tool, buildContract] of CONTRACTS) {
      expect(buildContract().pluginRootToken, tool).toBe(pluginsOf(tool)?.pluginRootToken);
    }
  });

  it("leaves a command alone for the tool whose variable is the one authors write", () => {
    const authored = `node ${pluginsOf("claude")?.pluginRootToken}/hooks/journal.cjs`;

    const token = buildClaudeContract().pluginRootToken;

    expect(rewritePluginRootToken(authored, token ?? "")).toBe(authored);
  });
});

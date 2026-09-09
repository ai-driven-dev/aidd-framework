import { describe, expect, it } from "vitest";
import type { AiTool, HasPlugins } from "../../../../src/contexts/tools/domain/contracts.js";
import { claude } from "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { codex } from "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { copilot } from "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import { cursor } from "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { opencode } from "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { PluginContentTranslator } from "../../../../src/contexts/translate/domain/content-translator.js";
import { PluginDistribution } from "../../../../src/contexts/translate/domain/plugin-distribution.js";
import { FileHash } from "../../../../src/kernel/file.js";

/** A hook that arrives is not a hook that runs: every failure this covers installed cleanly
 * and did nothing. */

const stubHasher = { hash: (_content: string) => new FileHash("a".repeat(32)) };
const translator = new PluginContentTranslator(stubHasher);

const SOURCE_TOKEN = claude.capabilities.plugins.pluginRootToken ?? "";
const HOOK_COMMAND = `node ${SOURCE_TOKEN}/hooks/journal.cjs session-start`;
const SCRIPT = `#!/usr/bin/env node\n// carries ${SOURCE_TOKEN} in a comment\n`;
const HOOKS_JSON = JSON.stringify({
  hooks: { SessionStart: [{ hooks: [{ type: "command", command: HOOK_COMMAND }] }] },
});

const HOOK_HOSTS: ReadonlyArray<AiTool<HasPlugins>> = [claude, cursor, copilot, codex];

const MCP_JSON = JSON.stringify({
  mcpServers: { local: { command: `${SOURCE_TOKEN}/bin/server.js`, args: [] } },
});

function pluginWithHookAndScript(): PluginDistribution {
  const hooks = [
    { relativePath: "hooks/hooks.json", content: HOOKS_JSON },
    { relativePath: "hooks/journal.cjs", content: SCRIPT },
  ];
  const mcp = [{ relativePath: ".mcp.json", content: MCP_JSON }];
  return new PluginDistribution({
    manifest: { name: "aidd-telemetry", version: "1.0.0" },
    format: "claude",
    files: [...hooks, ...mcp],
    components: { commands: [], agents: [], rules: [], skills: [], hooks, mcp },
  });
}

function installedFor(tool: AiTool<HasPlugins>) {
  return translator.translateWithComponentPaths(pluginWithHookAndScript(), tool);
}

function contentEndingWith(
  result: ReturnType<typeof installedFor>,
  suffix: string
): string | undefined {
  return result.files.find((file) => file.relativePath.endsWith(suffix))?.content;
}

describe("installing a plugin that ships hooks", () => {
  it("delivers them to every tool that runs hooks", () => {
    for (const tool of HOOK_HOSTS) {
      expect(installedFor(tool).files, tool.toolId).not.toHaveLength(0);
    }
  });

  it("writes a command naming the variable that tool expands, never another tool's", () => {
    for (const tool of HOOK_HOSTS) {
      if (tool.capabilities.plugins.hooksContentFormat !== "matchers") continue;
      const manifest = contentEndingWith(installedFor(tool), "hooks.json") ?? "";

      expect(manifest, tool.toolId).toContain(tool.capabilities.plugins.pluginRootToken);
      if (tool.capabilities.plugins.pluginRootToken === SOURCE_TOKEN) continue;
      expect(manifest, tool.toolId).not.toContain(SOURCE_TOKEN);
    }
  });

  it("resolves the root itself for a tool whose whole hook format is rewritten", () => {
    // Cursor's converter turns the root into a path relative to the plugin, a third answer
    // to the same question, and its hooks are the one set that could not be observed running.
    const manifest = contentEndingWith(installedFor(cursor), "hooks.json") ?? "";

    expect(manifest).toContain('"command": "node ./hooks/journal.cjs session-start"');
    expect(manifest).not.toContain(SOURCE_TOKEN);
    expect(cursor.capabilities.plugins.pluginRootToken).not.toBe("./");
  });

  it("leaves a script beside the hook byte for byte, its plugin root untouched", () => {
    // Measured: rewriting a script's content changed it by six bytes on one tool and lost
    // one on another. A script is carried, never translated.
    for (const tool of HOOK_HOSTS) {
      expect(contentEndingWith(installedFor(tool), "journal.cjs"), tool.toolId).toBe(SCRIPT);
    }
  });

  it("points an mcp server at the plugin root the target tool expands", () => {
    // The one place the substitution changes an installed byte: Cursor's own converter
    // rewrites a hook manifest wholesale, every other tool expands the source's spelling.
    for (const tool of HOOK_HOSTS) {
      const served = contentEndingWith(
        installedFor(tool),
        tool.capabilities.plugins.mcpRelativePath
      );

      // A tool that delivered no mcp file would pass the assertion below by never
      // reaching it, which is the failure shape this whole file exists to catch.
      expect(served, `${tool.toolId} installed no mcp file to check`).toBeDefined();
      expect(served, tool.toolId).toContain(tool.capabilities.plugins.pluginRootToken);
    }
  });

  it("delivers OpenCode's script under flatHooksDir instead of skipping it (Phase 7)", () => {
    const result = installedFor(opencode);

    expect(result.skipped).toEqual([]);
    const flatHooksDir = opencode.capabilities.plugins.flatHooksDir ?? "";
    expect(contentEndingWith(result, "journal.cjs")).toBe(SCRIPT);
    expect(result.files.some((file) => file.relativePath === `${flatHooksDir}hooks.json`)).toBe(
      false
    );
  });
});

describe("what a tool says about the hooks it runs", () => {
  it("never leaves its answer to a default", () => {
    for (const tool of [...HOOK_HOSTS, opencode]) {
      const { acceptsHooks, hooksUnsupportedReason } = tool.capabilities.plugins;

      expect(acceptsHooks === (hooksUnsupportedReason === null), tool.toolId).toBe(true);
    }
  });
});

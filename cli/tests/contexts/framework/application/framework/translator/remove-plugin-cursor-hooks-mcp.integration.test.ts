/**
 * Phase 2 — Cursor remove: confirm hooks.json and mcp.json are tracked in Plugin.files
 * so the existing deletePluginFiles mechanism will remove them on uninstall.
 *
 * The actual file deletion is tested indirectly: we verify that Plugin.files keys
 * match the written absolute paths (so join(resolvedBase, key) == absolutePath).
 * PluginRemoveUseCase.deletePluginFiles iterates these keys, so if they're correct
 * the files will be removed.
 */
import "../../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ModeBFlatMaterializationTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/mode-b-flat-materialization-translator.js";
import { Manifest } from "../../../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistribution } from "../../../../../../src/contexts/translate/domain/plugin-distribution.js";
import { DeterministicHasher } from "../../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";

const STUB_HOME = "/tmp/test-home";
const PROJECT_ROOT = "/test-project";
const PLUGIN_NAME = "aidd-context";
const RESOLVED_BASE = join(STUB_HOME, ".cursor", "plugins", "local");

// biome-ignore lint/suspicious/noTemplateCurlyInString: intentionally testing Claude hook placeholder substitution
const PLUGIN_ROOT_VAR = "${CLAUDE_PLUGIN_ROOT}";

const HOOKS_CONTENT = JSON.stringify({
  hooks: {
    PreToolUse: [
      {
        hooks: [{ type: "command", command: `node ${PLUGIN_ROOT_VAR}/hooks/pre.js` }],
      },
    ],
  },
});

const MCP_CONTENT = JSON.stringify({
  mcpServers: {
    "local-tool": { command: "node", args: ["./mcp-server.js"] },
  },
});

function buildDist(): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: PLUGIN_NAME, version: "1.0.0" },
    format: "claude",
    files: [
      { relativePath: "hooks/hooks.json", content: HOOKS_CONTENT },
      { relativePath: ".mcp.json", content: MCP_CONTENT },
    ],
    components: {
      commands: [],
      agents: [],
      rules: [],
      skills: [],
      hooks: [{ relativePath: "hooks/hooks.json", content: HOOKS_CONTENT }],
      mcp: [{ relativePath: ".mcp.json", content: MCP_CONTENT }],
    },
  });
}

describe("Cursor plugin.files tracking enables uninstall of hooks.json and mcp.json (Phase 2)", () => {
  it("Plugin.files keys join to the exact written absolute paths (uninstall can find the files)", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);

    await adapter.addPlugin(
      buildDist(),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    const plugins = manifest.getPlugins("cursor");
    const installed = plugins.find((p) => p.name === PLUGIN_NAME);
    expect(installed).toBeDefined();
    const keys = [...(installed?.files.keys() ?? [])];
    expect(keys.some((k) => k.endsWith("hooks.json"))).toBe(true);
    expect(keys.some((k) => k.endsWith("mcp.json"))).toBe(true);
    // Every tracked key, when joined with resolvedBase, must match a written file
    for (const key of keys) {
      const absPath = join(RESOLVED_BASE, key);
      expect(fs.has(absPath)).toBe(true);
    }
  });
});

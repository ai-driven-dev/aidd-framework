/**
 * Phase 6 — Cursor flat (native user-scope) hooks + mcp parity.
 * Plugin-scope hooks were measured to never fire (three probes, see
 * aidd_docs/tasks/2026_08/2026_08_22_telemetry-every-tool/measurements.md, Phase 4),
 * so hooksDestination:"project" in cursor.ts now routes hooks/hooks.json to the
 * project's own .cursor/hooks.json instead — the destination measured to fire.
 * Asserts that:
 *   - hooks/hooks.json is merged into the project's .cursor/hooks.json (camelCase
 *     events, ${CLAUDE_PLUGIN_ROOT}/ → ./.cursor/hooks/<plugin>/)
 *   - .mcp.json is still passed through as mcp.json at the plugin root, unchanged
 *   - hooks.json is NOT tracked in Plugin.files (it isn't under the plugin's own
 *     baseDir, so `plugin remove`'s baseDir-relative deletePluginFiles must not try)
 *   - No skip warnings are emitted
 */
import "../../../../../src/domain/tools/ai/cursor.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ModeBFlatMaterializationTranslator } from "../../../../../src/application/use-cases/plugin/translator/mode-b-flat-materialization-translator.js";
import { Manifest } from "../../../../../src/domain/models/manifest.js";
import { PluginDistribution } from "../../../../../src/domain/models/plugin-distribution.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const STUB_HOME = "/tmp/test-home";
const PROJECT_ROOT = "/test-project";
const PLUGIN_NAME = "aidd-context";
const EXPECTED_BASE = join(STUB_HOME, ".cursor", "plugins", "local");

// biome-ignore lint/suspicious/noTemplateCurlyInString: intentionally testing Claude hook placeholder substitution
const PLUGIN_ROOT_VAR = "${CLAUDE_PLUGIN_ROOT}";

const HOOKS_CONTENT = JSON.stringify({
  hooks: {
    PreToolUse: [
      {
        hooks: [
          {
            type: "command",
            command: `node ${PLUGIN_ROOT_VAR}/hooks/pre.js`,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        hooks: [
          {
            type: "command",
            command: `node ${PLUGIN_ROOT_VAR}/hooks/post.js`,
          },
        ],
      },
    ],
  },
});

const MCP_CONTENT = JSON.stringify({
  mcpServers: {
    "local-tool": {
      command: "node",
      args: ["./mcp-server.js"],
    },
    "remote-tool": {
      url: "https://example.com/mcp",
    },
    "disabled-tool": {
      command: "python",
      args: ["./disabled.py"],
      disabled: true,
    },
  },
});

function buildDist(): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: PLUGIN_NAME, version: "1.0.0" },
    format: "claude",
    files: [
      { relativePath: "hooks/hooks.json", content: HOOKS_CONTENT },
      { relativePath: ".mcp.json", content: MCP_CONTENT },
      { relativePath: "commands/hello.md", content: "---\nname: aidd:01:hello\n---\n# Hello" },
    ],
    components: {
      commands: [
        { relativePath: "commands/hello.md", content: "---\nname: aidd:01:hello\n---\n# Hello" },
      ],
      agents: [],
      rules: [],
      skills: [],
      hooks: [{ relativePath: "hooks/hooks.json", content: HOOKS_CONTENT }],
      mcp: [{ relativePath: ".mcp.json", content: MCP_CONTENT }],
    },
  });
}

describe("install cursor plugin with hooks and mcp (Phase 6)", () => {
  it("merges converted hooks.json into the project's .cursor/hooks.json with camelCase events", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);

    const { skipped } = await adapter.addPlugin(
      buildDist(),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    const hooksPath = join(PROJECT_ROOT, ".cursor", "hooks.json");
    expect(fs.has(hooksPath)).toBe(true);
    expect(fs.has(join(EXPECTED_BASE, PLUGIN_NAME, "hooks.json"))).toBe(false);
    const parsed = JSON.parse(await fs.readFile(hooksPath)) as { hooks: Record<string, unknown> };
    expect(parsed.hooks).toHaveProperty("preToolUse");
    expect(parsed.hooks).toHaveProperty("postToolUse");
    expect(parsed.hooks).not.toHaveProperty("PreToolUse");
    expect(parsed.hooks).not.toHaveProperty("PostToolUse");
    expect(skipped).toHaveLength(0);
  });

  // biome-ignore lint/suspicious/noTemplateCurlyInString: describes the Claude hook placeholder
  it("rewrites ${CLAUDE_PLUGIN_ROOT}/ to the project's own .cursor/hooks/<plugin>/ in hook commands", async () => {
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

    const hooksPath = join(PROJECT_ROOT, ".cursor", "hooks.json");
    const content = await fs.readFile(hooksPath);
    expect(content).not.toContain("CLAUDE_PLUGIN_ROOT");
    expect(content).toContain(`./.cursor/hooks/${PLUGIN_NAME}/pre.js`);
    expect(content).toContain(`./.cursor/hooks/${PLUGIN_NAME}/post.js`);
  });

  it("writes mcp.json at plugin root with the source content unchanged", async () => {
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

    const mcpPath = join(EXPECTED_BASE, PLUGIN_NAME, "mcp.json");
    expect(fs.has(mcpPath)).toBe(true);
    // Cursor consumes Claude-format .mcp.json natively — content is passed through as-is
    const written = JSON.parse(await fs.readFile(mcpPath)) as Record<string, unknown>;
    const source = JSON.parse(MCP_CONTENT) as Record<string, unknown>;
    expect(written).toEqual(source);
  });

  it("tracks mcp.json in Plugin.files for uninstall; hooks.json is not (it isn't under the plugin's own baseDir)", async () => {
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
    expect(keys.some((k) => k.endsWith("hooks.json"))).toBe(false);
    expect(keys.some((k) => k.endsWith("mcp.json"))).toBe(true);
  });

  it("emits no skip warnings for hooks or mcp", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);

    const { skipped } = await adapter.addPlugin(
      buildDist(),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    expect(skipped).toHaveLength(0);
  });
});

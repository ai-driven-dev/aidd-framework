/**
 * Phase 7, Task 2 — a marketplace-sourced Cursor install must deliver hooks to the
 * same destination a local-source install does. Phase 6 routed the local-source route
 * (ModeBFlatMaterializationTranslator) into the project's own .cursor/hooks.json;
 * BuiltTreeMaterializationTranslator — the marketplace route, taken when
 * `aidd plugin install <name> --from <marketplace>` resolves a registered marketplace —
 * still copied the built tree's plugin-scoped hooks/hooks.json verbatim into
 * ~/.cursor/plugins/local/<plugin>/hooks/hooks.json, the directory three probes showed
 * Cursor never reads (see measurements.md, Phase 4). Both routes now delegate to the
 * one ProjectHooksMaterializer, decided by cursor.ts's own hooksDestination declaration.
 *
 * The last test asserts the two translators agree on destination directly — the disagreement
 * test the phase instruction asked for, not just "both happen to look right today".
 */
import "../../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../../src/contexts/distribution/domain/marketplace.js";
import { BuiltTreeMaterializationTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/built-tree-materialization-translator.js";
import { ModeBFlatMaterializationTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/mode-b-flat-materialization-translator.js";
import type { PluginTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/plugin-translator.js";
import { Manifest } from "../../../../../../src/contexts/framework/domain/manifest.js";
import { getToolConfig, isAiTool } from "../../../../../../src/contexts/tools/domain/registry.js";
import { PluginDistribution } from "../../../../../../src/contexts/translate/domain/plugin-distribution.js";
import type { AiToolId } from "../../../../../../src/kernel/tool.js";
import { DeterministicHasher } from "../../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceRegistry } from "../../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/proj";
const HOME = "/home/u";
const BUILT = "/built/cursor";
const PLUGIN_NAME = "sample-plugin";

// biome-ignore lint/suspicious/noTemplateCurlyInString: intentionally testing Claude hook placeholder substitution
const PLUGIN_ROOT_VAR = "${CLAUDE_PLUGIN_ROOT}";

const HOOKS_CONTENT = JSON.stringify({
  hooks: {
    PostToolUse: [
      { hooks: [{ type: "command", command: `node ${PLUGIN_ROOT_VAR}/hooks/post.js` }] },
    ],
  },
});

function dist(): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: PLUGIN_NAME, version: "1.0.0" },
    format: "claude",
    files: [{ relativePath: "hooks/hooks.json", content: HOOKS_CONTENT }],
    components: {
      commands: [],
      agents: [],
      rules: [],
      skills: [],
      hooks: [
        { relativePath: "hooks/hooks.json", content: HOOKS_CONTENT },
        { relativePath: "hooks/post.js", content: "module.exports = () => {};" },
      ],
      mcp: [],
    },
  });
}

async function makeRegistry(): Promise<InMemoryMarketplaceRegistry> {
  const registry = new InMemoryMarketplaceRegistry();
  await registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name: "aidd-framework",
      source: { kind: "local", path: "/src/framework" },
      scope: "project",
      addedAt: "2026-01-01T00:00:00Z",
    })
  );
  return registry;
}

describe("BuiltTreeMaterializationTranslator — cursor marketplace hooks (Phase 7)", () => {
  it("merges hooks into the project's .cursor/hooks.json, not the plugin-scoped built tree", async () => {
    const fs = new InMemoryFileAdapter();
    fs.setFile(`${BUILT}/plugins/${PLUGIN_NAME}/hooks/hooks.json`, HOOKS_CONTENT);
    fs.setFile(`${BUILT}/plugins/${PLUGIN_NAME}/hooks/post.js`, "module.exports = () => {};");
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);
    const translator = new BuiltTreeMaterializationTranslator(
      fs,
      new DeterministicHasher(),
      () => HOME,
      fakeEnsureBuiltMarketplace(),
      await makeRegistry()
    );

    const { skipped } = await translator.addPlugin(
      dist(),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      "aidd-framework"
    );

    const hooksPath = join(PROJECT_ROOT, ".cursor", "hooks.json");
    expect(fs.has(hooksPath)).toBe(true);
    const parsed = JSON.parse(fs.getFile(hooksPath) ?? "{}") as { hooks: Record<string, unknown> };
    expect(parsed.hooks).toHaveProperty("postToolUse");
    expect(skipped).toEqual([]);
  });

  it("writes no hooks/ path under the plugin-scoped built-tree destination", async () => {
    const fs = new InMemoryFileAdapter();
    fs.setFile(`${BUILT}/plugins/${PLUGIN_NAME}/hooks/hooks.json`, HOOKS_CONTENT);
    fs.setFile(`${BUILT}/plugins/${PLUGIN_NAME}/hooks/post.js`, "module.exports = () => {};");
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);
    const translator = new BuiltTreeMaterializationTranslator(
      fs,
      new DeterministicHasher(),
      () => HOME,
      fakeEnsureBuiltMarketplace(),
      await makeRegistry()
    );

    await translator.addPlugin(
      dist(),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      "aidd-framework"
    );

    const base = `${HOME}/.cursor/plugins/local/${PLUGIN_NAME}`;
    const written = fs.listUnder(base);
    expect(written.some((p) => p.includes("hooks"))).toBe(false);
  });
});

describe("Cursor's two install routes agree on hooks destination (Phase 7, Task 2)", () => {
  async function installViaLocal(): Promise<InMemoryFileAdapter> {
    const fs = new InMemoryFileAdapter();
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);
    const translator: PluginTranslator = new ModeBFlatMaterializationTranslator(
      fs,
      new DeterministicHasher(),
      () => HOME
    );
    await translator.addPlugin(
      dist(),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined
    );
    return fs;
  }

  async function installViaMarketplace(): Promise<InMemoryFileAdapter> {
    const fs = new InMemoryFileAdapter();
    fs.setFile(`${BUILT}/plugins/${PLUGIN_NAME}/hooks/hooks.json`, HOOKS_CONTENT);
    fs.setFile(`${BUILT}/plugins/${PLUGIN_NAME}/hooks/post.js`, "module.exports = () => {};");
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);
    const translator: PluginTranslator = new BuiltTreeMaterializationTranslator(
      fs,
      new DeterministicHasher(),
      () => HOME,
      fakeEnsureBuiltMarketplace(),
      await makeRegistry()
    );
    await translator.addPlugin(
      dist(),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      "aidd-framework"
    );
    return fs;
  }

  // The destination this test pins to is read from cursor.ts's own declaration, not
  // hard-coded — so it fails if either translator drifts from what the tool itself names,
  // not merely if the two translators drift from each other (both regressing to plugin
  // scope together would still pass a route-vs-route-only comparison).
  function declaredHooksDestination(toolId: AiToolId): "plugin" | "project" {
    const toolConfig = getToolConfig(toolId);
    if (!isAiTool(toolConfig)) throw new Error(`${toolId} is not an AI tool`);
    const caps = toolConfig.capabilities as Record<string, unknown>;
    return (caps.plugins as { hooksDestination: "plugin" | "project" }).hooksDestination;
  }

  it("both routes write to the destination cursor.ts declares — a plugin.hooksDestination change breaks this", async () => {
    expect(declaredHooksDestination("cursor")).toBe("project");

    const viaLocal = await installViaLocal();
    const viaMarketplace = await installViaMarketplace();

    const projectHooksPath = join(PROJECT_ROOT, ".cursor", "hooks.json");
    expect(viaLocal.has(projectHooksPath)).toBe(true);
    expect(viaMarketplace.has(projectHooksPath)).toBe(true);

    const pluginScopedBase = `${HOME}/.cursor/plugins/local/${PLUGIN_NAME}`;
    expect(viaLocal.listUnder(pluginScopedBase).some((p) => p.includes("hooks"))).toBe(false);
    expect(viaMarketplace.listUnder(pluginScopedBase).some((p) => p.includes("hooks"))).toBe(false);
  });
});

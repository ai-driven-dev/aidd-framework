import { describe, expect, it } from "vitest";
import type { AiTool, HasPlugins } from "../../../../src/contexts/tools/domain/contracts.js";
import { buildClaudeContract } from "../../../../src/contexts/tools/domain/profiles/claude/build.js";
import { claude } from "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { buildCodexContract } from "../../../../src/contexts/tools/domain/profiles/codex/build.js";
import { codex } from "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { buildCopilotMarketplaceContract } from "../../../../src/contexts/tools/domain/profiles/copilot/build.js";
import { copilot } from "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import { buildCursorContract } from "../../../../src/contexts/tools/domain/profiles/cursor/build.js";
import { cursor } from "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { opencode } from "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { PluginContentTranslator } from "../../../../src/contexts/translate/domain/content-translator.js";
import { rewritePluginRootToken } from "../../../../src/contexts/translate/domain/formats/plugin-root-token-rewrite.js";
import { PluginDistribution } from "../../../../src/contexts/translate/domain/plugin-distribution.js";
import { FileHash } from "../../../../src/kernel/file.js";

/**
 * A hook command that points at nothing installs clean, reports success, and does nothing.
 * Every failure in this ticket had that shape, so this reads the command back out of what
 * was installed and asks whether the file it names is there.
 */

const stubHasher = { hash: (_content: string) => new FileHash("a".repeat(32)) };
const translator = new PluginContentTranslator(stubHasher);

const PLUGIN = "aidd-telemetry";
const SOURCE_TOKEN = claude.capabilities.plugins.pluginRootToken ?? "";
const SCRIPTS = ["hooks/journal.cjs", "hooks/lib/record.cjs"];
const HOOKS_JSON = JSON.stringify({
  hooks: {
    SessionStart: [
      {
        hooks: [
          { type: "command", command: `node ${SOURCE_TOKEN}/hooks/journal.cjs session-start` },
        ],
      },
    ],
  },
});

const HOOK_HOSTS: ReadonlyArray<AiTool<HasPlugins>> = [claude, cursor, copilot, codex];

function distribution(): PluginDistribution {
  const hooks = [
    { relativePath: "hooks/hooks.json", content: HOOKS_JSON },
    ...SCRIPTS.map((relativePath) => ({ relativePath, content: "// a script\n" })),
  ];
  return new PluginDistribution({
    manifest: { name: PLUGIN, version: "1.0.0" },
    format: "claude",
    files: hooks,
    components: { commands: [], agents: [], rules: [], skills: [], hooks, mcp: [] },
  });
}

/** Every path a hook command names, as the tool would resolve it: its own plugin-root
 * variable and a leading `./` both mean the plugin's own directory. */
function commandTargets(manifest: string, tool: AiTool<HasPlugins>): string[] {
  const token = tool.capabilities.plugins.pluginRootToken ?? "";
  return [...manifest.matchAll(/"command":\s*"([^"]+)"/gu)]
    .flatMap((match) => (match[1] ?? "").split(" "))
    .filter((word) => word.includes("/") && !word.startsWith("-"))
    .map((word) => word.replace(token, "").replace(/^\.\//u, "").replace(/^\//u, ""));
}

function installed(tool: AiTool<HasPlugins>): { paths: string[]; manifest: string } {
  const { files } = translator.translateWithComponentPaths(distribution(), tool);
  const root = `${tool.capabilities.plugins.pluginsDir}${PLUGIN}/`;
  return {
    paths: files.map((file) => file.relativePath.replace(root, "")),
    manifest: files.find((file) => file.relativePath.endsWith("hooks.json"))?.content ?? "",
  };
}

describe("a hook that was installed", () => {
  it("names a file the same install put there", () => {
    for (const tool of HOOK_HOSTS) {
      const { paths, manifest } = installed(tool);
      const targets = commandTargets(manifest, tool);

      // An installed hook that names nothing would pass every assertion below by never
      // reaching them, which is the failure shape this whole file exists to catch.
      expect(targets, `${tool.toolId} installed no hook command to check`).not.toHaveLength(0);
      for (const target of targets) {
        expect(
          paths,
          `${tool.toolId} hook names ${target}; delivered ${paths.join(", ")}`
        ).toContain(target);
      }
    }
  });

  it("names something at all, rather than a variable the tool leaves as text", () => {
    for (const tool of HOOK_HOSTS) {
      const { manifest } = installed(tool);
      expect(commandTargets(manifest, tool), tool.toolId).not.toHaveLength(0);
      if (tool.capabilities.plugins.pluginRootToken === SOURCE_TOKEN) continue;

      expect(manifest, tool.toolId).not.toContain(SOURCE_TOKEN);
    }
  });

  it("carries every script the hook could reach, not only the one it names", () => {
    for (const tool of HOOK_HOSTS) {
      const { paths } = installed(tool);

      expect(paths, tool.toolId).toEqual(expect.arrayContaining(SCRIPTS));
    }
  });
});

/** The two routes write different layouts by design — one a bundle, the other a tool's own
 * directory — so what has to agree is the plugin's own file the command names. */
const BUILT_BY: ReadonlyArray<[AiTool<HasPlugins>, () => { pluginRootToken?: string | null }]> = [
  [claude, buildClaudeContract],
  [cursor, buildCursorContract],
  [copilot, buildCopilotMarketplaceContract],
  [codex, buildCodexContract],
];

describe("the two ways a plugin gets installed", () => {
  it("point a hook at the same file, whichever route delivered it", () => {
    for (const [tool, buildContract] of BUILT_BY) {
      const built = rewritePluginRootToken(HOOKS_JSON, buildContract().pluginRootToken ?? "");
      const fromBuild = commandTargets(built, tool);

      expect(fromBuild, tool.toolId).not.toHaveLength(0);
      expect(fromBuild, tool.toolId).toEqual(commandTargets(installed(tool).manifest, tool));
    }
  });

  it("deliver hooks exactly when the tool runs them", () => {
    for (const tool of [...HOOK_HOSTS, opencode]) {
      const { files, skipped } = translator.translateWithComponentPaths(distribution(), tool);
      const carriesHooks = files.some((file) => file.relativePath.endsWith(".cjs"));

      expect(carriesHooks, tool.toolId).toBe(tool.capabilities.plugins.acceptsHooks);
      expect(skipped.length > 0, tool.toolId).toBe(!tool.capabilities.plugins.acceptsHooks);
    }
  });
});

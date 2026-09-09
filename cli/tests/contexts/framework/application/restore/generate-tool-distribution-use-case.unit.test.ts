import { describe, expect, it } from "vitest";
import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import { GenerateToolDistributionUseCase } from "../../../../../src/contexts/framework/application/restore/generate-tool-distribution-use-case.js";
import { CONFIG_VSCODE_SETTINGS } from "../../../../../src/contexts/tools/domain/capabilities/config-refs.js";
import {
  getToolConfig,
  isAiTool,
  type ToolConfig,
} from "../../../../../src/contexts/tools/domain/registry.js";
import { FrameworkDescriptor } from "../../../../../src/contexts/translate/domain/canon.js";
import { InstallationFile } from "../../../../../src/kernel/file.js";
import type { ToolId } from "../../../../../src/kernel/tool.js";
import { BundledAssetProviderAdapter } from "../../../../../src/runtime/assets/asset-loader.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { FakePlatform } from "../../../../helpers/ports/fake-platform.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/test-project";
const MARKDOWN = "---\nname: sample\ndescription: A sample.\n---\n\nBody.\n";

const descriptor = new FrameworkDescriptor({
  version: "test",
  contentSections: ["agents", "commands", "rules", "skills", "templates"].map((name) => ({
    name,
    directory: name,
    entryFile: null,
  })),
  templateRefs: [],
  configRefs: [{ name: CONFIG_VSCODE_SETTINGS, path: "config/vscode/settings.json" }],
});

const contentFiles = new Map([
  ["agents/reviewer.md", MARKDOWN],
  ["commands/greet.md", MARKDOWN],
  ["rules/naming.md", MARKDOWN],
  ["skills/hello/SKILL.md", MARKDOWN],
  ["templates/AGENTS.md", MARKDOWN],
  ["config/vscode/settings.json", '{"editor.tabSize": 2}'],
]);

const hasher = new DeterministicHasher();
const assets = new BundledAssetProviderAdapter();

function generate(
  config: ToolConfig,
  assetProvider?: BundledAssetProviderAdapter
): Promise<InstallationFile[]> {
  return new GenerateToolDistributionUseCase(
    new InMemoryFileAdapter({}, hasher),
    hasher,
    new FakePlatform("linux"),
    assetProvider
  ).execute({ config, descriptor, contentFiles, projectRoot: PROJECT_ROOT });
}

async function pathsFor(toolId: ToolId, assetProvider?: BundledAssetProviderAdapter) {
  return (await generate(getToolConfig(toolId), assetProvider)).map((f) => f.relativePath).sort();
}

describe("GenerateToolDistributionUseCase — content sections", () => {
  it("gives an IDE tool its config files and no content section", async () => {
    expect(await pathsFor("vscode")).toStrictEqual([".vscode/settings.json"]);
  });

  it("gives an AI tool one file per content section its capabilities accept", async () => {
    expect(await pathsFor("claude")).toStrictEqual([
      ".claude/agents/reviewer.md",
      ".claude/commands/greet.md",
      ".claude/rules/naming.md",
      ".claude/skills/hello/SKILL.md",
    ]);
  });

  it("skips a section the tool declares no capability for", async () => {
    const claude = getToolConfig("claude");
    if (!isAiTool(claude)) throw new Error("claude is an AI tool");
    const { rules: _rules, ...capabilities } = claude.capabilities as Record<string, unknown>;

    const paths = (await generate({ ...claude, capabilities })).map((f) => f.relativePath).sort();

    expect(paths).toStrictEqual([
      ".claude/agents/reviewer.md",
      ".claude/commands/greet.md",
      ".claude/skills/hello/SKILL.md",
    ]);
  });
});

describe("GenerateToolDistributionUseCase — a tool's own config assets", () => {
  it("writes a JSON asset pretty-printed at the path the tool declares", async () => {
    const files = await generate(getToolConfig("claude"), assets);
    const content = JSON.stringify(assets.loadConfigAsset("claude", "settings.json"), null, 2);

    expect(files.find((f) => f.relativePath === ".claude/settings.json")).toStrictEqual(
      new InstallationFile({
        relativePath: ".claude/settings.json",
        content,
        hash: hasher.hash(content),
      })
    );
  });

  it("writes a text asset verbatim", async () => {
    const asset = assets.loadConfigAsset("codex", "config.toml");
    if (typeof asset !== "string") throw new Error("the codex config asset is text");

    const files = await generate(getToolConfig("codex"), assets);

    expect(files.find((f) => f.relativePath === ".codex/config.toml")?.content).toBe(asset);
  });

  it("adds only what a capability loads for a tool that declares no config asset path", async () => {
    const withoutAssets = await pathsFor("copilot");

    expect(await pathsFor("copilot", assets)).toStrictEqual(
      [...withoutAssets, ".vscode/settings.json"].sort()
    );
  });
});

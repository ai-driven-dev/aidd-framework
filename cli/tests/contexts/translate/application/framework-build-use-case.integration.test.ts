import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { JsonSchemaValidator } from "../../../../src/contexts/tools/domain/ports/schema-validator.js";
import { buildCopilotMarketplaceContract } from "../../../../src/contexts/tools/domain/profiles/copilot/build.js";
import { MarketplaceBuildStrategy } from "../../../../src/contexts/translate/application/strategies/marketplace-build-strategy.js";
import { FrameworkBuildUseCase } from "../../../../src/contexts/translate/application/translate-source.js";
import {
  FrameworkPlaceholderInPluginError,
  InvalidBuildPathsError,
  InvalidSourceMarketplaceError,
  JsonSchemaValidationError,
} from "../../../../src/kernel/errors.js";
import type { AssetProvider } from "../../../../src/kernel/ports/asset-provider.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework");
const SOURCE_DIR = FIXTURE_DIR;
const OUT_DIR = "/tmp/aidd-build-test-out";

// Minimal plugin manifest JSON schema: only "name" required.
const MINIMAL_MANIFEST_SCHEMA = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string" } },
};

// Minimal marketplace JSON schema: only "name", "metadata", "owner", "plugins" required.
const MINIMAL_MARKETPLACE_SCHEMA = {
  type: "object",
  required: ["name", "metadata", "owner", "plugins"],
  properties: {
    name: { type: "string" },
    metadata: { type: "object" },
    owner: { type: "object" },
    plugins: { type: "array" },
  },
};

function makeValidator(fail = false): JsonSchemaValidator {
  return {
    validate(_schema: object, _data: unknown): void {
      if (fail) throw new JsonSchemaValidationError(["schema validation failed"]);
    },
  };
}

function makeAssetProvider(
  manifestSchema: object = MINIMAL_MANIFEST_SCHEMA,
  marketplaceSchema: object = MINIMAL_MARKETPLACE_SCHEMA
): AssetProvider {
  return {
    loadConfigAsset: () => {
      throw new Error("not used");
    },
    loadSchema: (name) => {
      if (name === "plugin-manifest") return manifestSchema;
      if (name === "marketplace") return marketplaceSchema;
      return {};
    },
  };
}

async function makeSeededFs(): Promise<InMemoryFileAdapter> {
  const fs = new InMemoryFileAdapter();
  await seedFromDirectory(fs, FIXTURE_DIR, { useAbsolutePaths: true });
  return fs;
}

function makeUseCase(
  fs: InMemoryFileAdapter,
  validator?: JsonSchemaValidator,
  assetProvider?: AssetProvider
): FrameworkBuildUseCase {
  const v = validator ?? makeValidator();
  const ap = assetProvider ?? makeAssetProvider();
  return new FrameworkBuildUseCase(
    fs,
    v,
    ap,
    new CapturingLogger(),
    new MarketplaceBuildStrategy(fs, v, ap, buildCopilotMarketplaceContract())
  );
}

describe("FrameworkBuildUseCase", () => {
  let fs: InMemoryFileAdapter;
  let logger: CapturingLogger;

  beforeEach(async () => {
    fs = await makeSeededFs();
    logger = new CapturingLogger();
  });

  describe("manifest validation", () => {
    it("throws JsonSchemaValidationError when manifest is invalid", async () => {
      const v = makeValidator(true);
      const ap = makeAssetProvider();
      const uc = new FrameworkBuildUseCase(
        fs,
        v,
        ap,
        logger,
        new MarketplaceBuildStrategy(fs, v, ap, buildCopilotMarketplaceContract())
      );
      await expect(
        uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" })
      ).rejects.toThrow(JsonSchemaValidationError);
    });
  });

  describe("plugin manifest synthesis", () => {
    it("writes synthesized plugin.json at the OpenPlugin output path", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const destPath = `${OUT_DIR}/plugins/aidd-test/.plugin/plugin.json`;
      expect(fs.has(destPath)).toBe(true);
    });

    it("synthesized plugin.json does not contain strict or $schema", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const raw = fs.getFile(`${OUT_DIR}/plugins/aidd-test/.plugin/plugin.json`) ?? "";
      expect(raw).not.toContain("strict");
      expect(raw).not.toContain("$schema");
    });

    it("synthesized plugin.json has skills array when skills directory has SKILL.md files", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const parsed = JSON.parse(
        fs.getFile(`${OUT_DIR}/plugins/aidd-test/.plugin/plugin.json`) ?? "{}"
      ) as { skills: string[] };
      expect(Array.isArray(parsed.skills)).toBe(true);
      expect(parsed.skills.some((s: string) => s.startsWith("./skills/"))).toBe(true);
    });

    it("synthesized plugin.json omits skills when no SKILL.md files exist", async () => {
      // Remove all SKILL.md files from the fixture
      for (const path of fs.listUnder(`${SOURCE_DIR}/plugins/aidd-test/skills`)) {
        if (path.endsWith("SKILL.md")) fs.deleteFile(path);
      }
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const parsed = JSON.parse(
        fs.getFile(`${OUT_DIR}/plugins/aidd-test/.plugin/plugin.json`) ?? "{}"
      ) as Record<string, unknown>;
      expect(parsed.skills).toBeUndefined();
    });

    it("synthesized plugin.json lists ./agents/*.md file paths when agents directory has .md files", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const parsed = JSON.parse(
        fs.getFile(`${OUT_DIR}/plugins/aidd-test/.plugin/plugin.json`) ?? "{}"
      ) as { agents: string[] };
      expect(parsed.agents).toEqual(["./agents/code-reviewer.md"]);
    });

    it("synthesized plugin.json omits agents when no .md files exist in agents directory", async () => {
      for (const path of fs.listUnder(`${SOURCE_DIR}/plugins/aidd-test/agents`)) {
        fs.deleteFile(path);
      }
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const parsed = JSON.parse(
        fs.getFile(`${OUT_DIR}/plugins/aidd-test/.plugin/plugin.json`) ?? "{}"
      ) as Record<string, unknown>;
      expect(parsed.agents).toBeUndefined();
    });

    it("source .claude-plugin/plugin.json is NOT copied to output", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-test/.claude-plugin/plugin.json`)).toBe(false);
    });
  });

  describe("agent emission + frontmatter strip", () => {
    it("emits agents with their original .md extension (no rename)", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-test/agents/code-reviewer.md`)).toBe(true);
      expect(fs.has(`${OUT_DIR}/plugins/aidd-test/agents/code-reviewer.agent.md`)).toBe(false);
    });

    it("preserves all frontmatter fields from agents (OpenPlugin does not strip)", async () => {
      const agentPath = `${SOURCE_DIR}/plugins/aidd-test/agents/extra.md`;
      fs.setFile(
        agentPath,
        "---\nname: extra\ndescription: desc\nversion: 1.0\ntags:\n  - test\n---\n\nBody."
      );
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const out = fs.getFile(`${OUT_DIR}/plugins/aidd-test/agents/extra.md`) ?? "";
      expect(out).toContain("name: 'extra'");
      expect(out).toContain("description: 'desc'");
      expect(out).toContain("version");
      expect(out).toContain("tags");
    });
  });

  describe("skill tree copy", () => {
    it("copies all skill files to the output", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const skillFiles = fs.listUnder(`${OUT_DIR}/plugins/aidd-test/skills`);
      expect(skillFiles.length).toBeGreaterThan(0);
    });

    it("rewrites @./ references in .md skill files", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const helloOut = fs.getFile(`${OUT_DIR}/plugins/aidd-test/skills/hello.md`) ?? "";
      expect(helloOut).toContain("[SKILL.md](./SKILL.md)");
    });

    it("rewrites @../ references in .md skill files", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const helloOut = fs.getFile(`${OUT_DIR}/plugins/aidd-test/skills/hello.md`) ?? "";
      expect(helloOut).toContain("[commit/SKILL.md](../commit/SKILL.md)");
    });
  });

  describe("hooks rewrite", () => {
    it("writes hooks.json with CLAUDE_PLUGIN_ROOT rewritten to OpenPlugin native token", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const destPath = `${OUT_DIR}/plugins/aidd-test/hooks/hooks.json`;
      const dest = fs.getFile(destPath) ?? "";
      const claudeVarRef = "$" + "{CLAUDE_PLUGIN_ROOT}";
      const pluginRootRef = "$" + "{PLUGIN_ROOT}";
      expect(dest).not.toContain(claudeVarRef);
      expect(dest).toContain(`${pluginRootRef}/hooks/check.sh`);
    });

    it("hooks.json output is valid JSON with same structure (minus the variable substitution)", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const dest = fs.getFile(`${OUT_DIR}/plugins/aidd-test/hooks/hooks.json`) ?? "";
      const parsed = JSON.parse(dest) as { hooks: { PreToolUse: unknown[] } };
      expect(parsed.hooks.PreToolUse).toBeDefined();
    });
  });

  describe("mcp rewrite", () => {
    it("writes .mcp.json with CLAUDE_PLUGIN_ROOT rewritten to OpenPlugin native token", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const dest = fs.getFile(`${OUT_DIR}/plugins/aidd-test/.mcp.json`) ?? "";
      const claudeVarRef = "$" + "{CLAUDE_PLUGIN_ROOT}";
      const pluginRootRef = "$" + "{PLUGIN_ROOT}";
      expect(dest).not.toContain(claudeVarRef);
      expect(dest).toContain(`${pluginRootRef}/bin/server.js`);
    });

    it(".mcp.json output preserves mcpServers structure", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const dest = fs.getFile(`${OUT_DIR}/plugins/aidd-test/.mcp.json`) ?? "";
      const pluginRootRef = "$" + "{PLUGIN_ROOT}";
      const parsed = JSON.parse(dest) as { mcpServers: Record<string, { command: string }> };
      expect(parsed.mcpServers["aidd-test-server"].command).toBe(`${pluginRootRef}/bin/server.js`);
    });
  });

  describe("@{{TOOLS}}/ halts the build", () => {
    it("throws FrameworkPlaceholderInPluginError and leaves partial output on disk", async () => {
      const badSkillPath = `${SOURCE_DIR}/plugins/aidd-test/skills/bad.md`;
      fs.setFile(badSkillPath, "# Bad\n@{{TOOLS}}/agents/something.md\n");
      const uc = makeUseCase(fs);
      await expect(
        uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" })
      ).rejects.toThrow(FrameworkPlaceholderInPluginError);
      const filesInOut = fs.listUnder(OUT_DIR);
      expect(filesInOut.length).toBeGreaterThan(0);
    });
  });

  describe("out-of-scope sections", () => {
    it("logs a warning for commands/ and rules/ directories and lists them in skippedSections", async () => {
      const v = makeValidator();
      const ap = makeAssetProvider();
      const uc = new FrameworkBuildUseCase(
        fs,
        v,
        ap,
        logger,
        new MarketplaceBuildStrategy(fs, v, ap, buildCopilotMarketplaceContract())
      );
      const result = await uc.execute({
        sourceDir: SOURCE_DIR,
        outDir: OUT_DIR,
        target: "copilot",
      });
      const [plugin] = result.plugins;
      expect(plugin.skippedSections).toContain("commands");
      expect(plugin.skippedSections).toContain("rules");
      expect(logger.warnMessages.some((m) => m.includes("commands"))).toBe(true);
      expect(logger.warnMessages.some((m) => m.includes("rules"))).toBe(true);
    });
  });

  describe("safety guard", () => {
    it("throws InvalidBuildPathsError when outDir equals sourceDir", async () => {
      const uc = makeUseCase(fs);
      await expect(
        uc.execute({ sourceDir: SOURCE_DIR, outDir: SOURCE_DIR, target: "copilot" })
      ).rejects.toThrow(InvalidBuildPathsError);
    });

    it("throws when outDir is inside sourceDir", async () => {
      const uc = makeUseCase(fs);
      await expect(
        uc.execute({ sourceDir: SOURCE_DIR, outDir: `${SOURCE_DIR}/dist`, target: "copilot" })
      ).rejects.toThrow(InvalidBuildPathsError);
    });

    it("throws when sourceDir is inside outDir", async () => {
      const uc = makeUseCase(fs);
      const parent = SOURCE_DIR.split("/").slice(0, -1).join("/");
      await expect(
        uc.execute({ sourceDir: SOURCE_DIR, outDir: parent, target: "copilot" })
      ).rejects.toThrow(InvalidBuildPathsError);
    });
  });

  describe("source marketplace parse", () => {
    it("throws InvalidSourceMarketplaceError when marketplace.json has malformed JSON", async () => {
      fs.setFile(`${SOURCE_DIR}/.claude-plugin/marketplace.json`, "not-json{");
      const uc = makeUseCase(fs);
      await expect(
        uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" })
      ).rejects.toThrow(InvalidSourceMarketplaceError);
    });

    it("throws InvalidSourceMarketplaceError when 'plugins' array is missing", async () => {
      fs.setFile(
        `${SOURCE_DIR}/.claude-plugin/marketplace.json`,
        JSON.stringify({ name: "test", owner: { name: "X" } })
      );
      const uc = makeUseCase(fs);
      await expect(
        uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" })
      ).rejects.toThrow(InvalidSourceMarketplaceError);
    });

    it("throws InvalidSourceMarketplaceError when a plugin name does not match a directory", async () => {
      fs.setFile(
        `${SOURCE_DIR}/.claude-plugin/marketplace.json`,
        JSON.stringify({
          name: "test",
          owner: { name: "X" },
          plugins: [{ name: "nonexistent-plugin", source: "./plugins/nonexistent-plugin" }],
        })
      );
      const uc = makeUseCase(fs);
      await expect(
        uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" })
      ).rejects.toThrow(InvalidSourceMarketplaceError);
    });
  });

  describe("marketplace field sourcing", () => {
    it("uses version from source marketplace entry when present", async () => {
      // Inject a version on the marketplace entry
      fs.setFile(
        `${SOURCE_DIR}/.claude-plugin/marketplace.json`,
        JSON.stringify({
          name: "aidd-framework",
          version: "0.1.0",
          description: "Test marketplace",
          owner: { name: "Test" },
          plugins: [
            {
              name: "aidd-test",
              source: "./plugins/aidd-test",
              description: "Test plugin",
              version: "9.9.9",
            },
          ],
        })
      );
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const marketplaceOut = JSON.parse(
        fs.getFile(`${OUT_DIR}/.plugin/marketplace.json`) ?? "{}"
      ) as { plugins: { version: string }[] };
      expect(marketplaceOut.plugins[0].version).toBe("9.9.9");
    });

    it("falls back to plugin.json version when source marketplace entry has no version", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const marketplaceOut = JSON.parse(
        fs.getFile(`${OUT_DIR}/.plugin/marketplace.json`) ?? "{}"
      ) as { plugins: { version: string }[] };
      expect(marketplaceOut.plugins[0].version).toBe("0.1.0");
    });

    it("throws InvalidSourceMarketplaceError when version cannot be resolved", async () => {
      fs.setFile(
        `${SOURCE_DIR}/plugins/aidd-test/.claude-plugin/plugin.json`,
        JSON.stringify({ name: "aidd-test", description: "Test" })
      );
      const uc = makeUseCase(fs);
      await expect(
        uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" })
      ).rejects.toThrow(InvalidSourceMarketplaceError);
    });

    it("throws InvalidSourceMarketplaceError when description cannot be resolved from either source", async () => {
      fs.setFile(
        `${SOURCE_DIR}/.claude-plugin/marketplace.json`,
        JSON.stringify({
          name: "aidd-framework",
          version: "0.1.0",
          owner: { name: "Test" },
          plugins: [{ name: "aidd-test", source: "./plugins/aidd-test", version: "0.1.0" }],
        })
      );
      fs.setFile(
        `${SOURCE_DIR}/plugins/aidd-test/.claude-plugin/plugin.json`,
        JSON.stringify({ name: "aidd-test", version: "0.1.0" })
      );
      const uc = makeUseCase(fs);
      await expect(
        uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" })
      ).rejects.toThrow(InvalidSourceMarketplaceError);
    });
  });

  describe("marketplace emission", () => {
    it("emits marketplace.json at the OpenPlugin output path", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      expect(fs.has(`${OUT_DIR}/.plugin/marketplace.json`)).toBe(true);
    });

    it("emitted marketplace.json has Copilot-native shape with metadata.pluginRoot", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" });
      const raw = fs.getFile(`${OUT_DIR}/.plugin/marketplace.json`) ?? "";
      const parsed = JSON.parse(raw) as {
        metadata: { pluginRoot: string };
        plugins: { source: string }[];
      };
      expect(parsed.metadata.pluginRoot).toBe("./plugins");
      expect(parsed.plugins[0].source).toBe("aidd-test");
      expect(raw.endsWith("\n")).toBe(true);
    });

    it("validates the emitted marketplace.json against the schema", async () => {
      const failingMarketplaceValidator = {
        validate(schema: object, _data: unknown): void {
          const s = schema as { properties?: { plugins?: unknown } };
          if (s.properties && "plugins" in s.properties) {
            throw new JsonSchemaValidationError(["marketplace schema fail"]);
          }
        },
      };
      const ap = makeAssetProvider();
      const uc = new FrameworkBuildUseCase(
        fs,
        failingMarketplaceValidator,
        ap,
        logger,
        new MarketplaceBuildStrategy(
          fs,
          failingMarketplaceValidator,
          ap,
          buildCopilotMarketplaceContract()
        )
      );
      await expect(
        uc.execute({ sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" })
      ).rejects.toThrow(JsonSchemaValidationError);
    });
  });

  describe("idempotency", () => {
    it("produces byte-identical output on a second run with identical inputs", async () => {
      const uc = makeUseCase(fs);
      const opts = { sourceDir: SOURCE_DIR, outDir: OUT_DIR, target: "copilot" as const };
      await uc.execute(opts);
      const firstRunFiles = Object.fromEntries(
        fs.listUnder(OUT_DIR).map((p) => [p, fs.getFile(p)])
      );
      await fs.deleteDirectory(OUT_DIR);
      await uc.execute(opts);
      const secondRunFiles = Object.fromEntries(
        fs.listUnder(OUT_DIR).map((p) => [p, fs.getFile(p)])
      );
      expect(Object.keys(firstRunFiles).sort()).toEqual(Object.keys(secondRunFiles).sort());
      for (const key of Object.keys(firstRunFiles)) {
        expect(firstRunFiles[key]).toBe(secondRunFiles[key]);
      }
    });
  });
});

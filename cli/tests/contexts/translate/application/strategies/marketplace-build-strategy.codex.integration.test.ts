import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildCodexContract } from "../../../../../src/contexts/tools/domain/profiles/codex/build.js";
import { parseToml } from "../../../../../src/contexts/tools/domain/profiles/codex/toml.js";
import { MarketplaceBuildStrategy } from "../../../../../src/contexts/translate/application/strategies/marketplace-build-strategy.js";
import { FrameworkBuildUseCase } from "../../../../../src/contexts/translate/application/translate-source.js";
import { AjvSchemaValidatorAdapter } from "../../../../../src/contexts/translate/infrastructure/schema-validator.js";
import { BundledAssetProviderAdapter } from "../../../../../src/infrastructure/assets/asset-loader.js";
import {
  FrameworkPlaceholderInPluginError,
  InvalidBuildPathsError,
  JsonSchemaValidationError,
} from "../../../../../src/kernel/errors.js";
import { parseFrontmatter } from "../../../../../src/kernel/markdown.js";
import type { AssetProvider } from "../../../../../src/kernel/ports/asset-provider.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const REAL_FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework-real");
const CODEX_FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework-codex");
const OUT_DIR = "/tmp/aidd-codex-test-out";

// Avoid biome noTemplateCurlyInString: split literal
const CLAUDE_ROOT_VAR = "$" + "{CLAUDE_PLUGIN_ROOT}";
const CODEX_ROOT_VAR = "$" + "{PLUGIN_ROOT}";

function makeBundledAssetProvider(): AssetProvider {
  return new BundledAssetProviderAdapter();
}

function makeUseCase(
  fs: InMemoryFileAdapter,
  assetProvider?: AssetProvider,
  logger?: CapturingLogger
): FrameworkBuildUseCase {
  const av = new AjvSchemaValidatorAdapter();
  const ap = assetProvider ?? makeBundledAssetProvider();
  const strategy = new MarketplaceBuildStrategy(fs, av, ap, buildCodexContract());
  return new FrameworkBuildUseCase(fs, av, ap, logger ?? new CapturingLogger(), strategy);
}

async function makeSeededFsFromReal(): Promise<InMemoryFileAdapter> {
  const fs = new InMemoryFileAdapter();
  await seedFromDirectory(fs, REAL_FIXTURE_DIR, { useAbsolutePaths: true });
  return fs;
}

async function makeSeededFsFromCodex(): Promise<InMemoryFileAdapter> {
  const fs = new InMemoryFileAdapter();
  await seedFromDirectory(fs, CODEX_FIXTURE_DIR, { useAbsolutePaths: true });
  return fs;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

describe("CodexOutputStrategy", () => {
  describe("tree shape (AC #1)", () => {
    let fs: InMemoryFileAdapter;

    beforeEach(async () => {
      fs = await makeSeededFsFromReal();
    });

    it("emits .agents/plugins/marketplace.json in output root", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      expect(fs.has(`${OUT_DIR}/.agents/plugins/marketplace.json`)).toBe(true);
    });

    it("emits .codex-plugin/plugin.json for each plugin", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-dev/.codex-plugin/plugin.json`)).toBe(true);
    });

    it("emits codex-agents/ TOML files for plugins with agents", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-dev/codex-agents/planner.toml`)).toBe(true);
      expect(fs.has(`${OUT_DIR}/plugins/aidd-dev/codex-agents/implementer.toml`)).toBe(true);
      expect(fs.has(`${OUT_DIR}/plugins/aidd-dev/codex-agents/reviewer.toml`)).toBe(true);
    });

    it("emits skills tree for plugins with skills", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const skillFiles = fs.listUnder(`${OUT_DIR}/plugins/aidd-context/skills`);
      expect(skillFiles.length).toBeGreaterThan(0);
    });

    it("emits hooks files for plugins with hooks", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-context/hooks/hooks.json`)).toBe(true);
    });

    it("emits .mcp.json for plugins with MCP", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-dev/.mcp.json`)).toBe(true);
    });
  });

  describe("idempotency (AC #2)", () => {
    it("produces byte-identical output on two consecutive runs", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      const opts = { sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" as const };
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

  describe("Codex manifest schema valid (AC #3)", () => {
    it("emitted plugin.json validates against bundled codex-plugin-manifest.json schema", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const raw = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/.codex-plugin/plugin.json`) ?? "{}";
      const parsed = JSON.parse(raw) as unknown;
      const av = new AjvSchemaValidatorAdapter();
      const schema = new BundledAssetProviderAdapter().loadSchema("codex-plugin-manifest");
      expect(() => av.validate(schema, parsed)).not.toThrow();
    });

    it("synthesized plugin.json has no agents field (D-8)", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const raw = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/.codex-plugin/plugin.json`) ?? "{}";
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed.agents).toBeUndefined();
    });
  });

  describe("marketplace schema valid (AC #4)", () => {
    it("emitted marketplace.json validates against bundled codex-marketplace-manifest.json schema", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const raw = fs.getFile(`${OUT_DIR}/.agents/plugins/marketplace.json`) ?? "{}";
      const parsed = JSON.parse(raw) as unknown;
      const av = new AjvSchemaValidatorAdapter();
      const schema = new BundledAssetProviderAdapter().loadSchema("codex-marketplace");
      expect(() => av.validate(schema, parsed)).not.toThrow();
    });

    it("emitted marketplace.json has Codex-native root: name + interface.displayName", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const raw = fs.getFile(`${OUT_DIR}/.agents/plugins/marketplace.json`) ?? "{}";
      const parsed = JSON.parse(raw) as {
        name: string;
        interface: { displayName: string };
      };
      expect(typeof parsed.name).toBe("string");
      expect(typeof parsed.interface.displayName).toBe("string");
    });

    it("emitted marketplace.json has Codex-native plugin entries (source object + policy + category)", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const raw = fs.getFile(`${OUT_DIR}/.agents/plugins/marketplace.json`) ?? "{}";
      const parsed = JSON.parse(raw) as {
        plugins: {
          name: string;
          source: { source: string; path: string };
          policy: { installation: string; authentication: string };
          category: string;
        }[];
      };
      const devPlugin = parsed.plugins.find((p) => p.name === "aidd-dev");
      expect(devPlugin?.source).toEqual({ source: "local", path: "./plugins/aidd-dev" });
      expect(devPlugin?.policy.installation).toBe("AVAILABLE");
      expect(typeof devPlugin?.policy.authentication).toBe("string");
      expect(typeof devPlugin?.category).toBe("string");
    });
  });

  describe("every agent produces valid TOML (AC #5)", () => {
    it("all codex-agents/*.toml files parse successfully", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const tomlFiles = fs.listUnder(OUT_DIR).filter((p) => p.endsWith(".toml"));
      expect(tomlFiles.length).toBeGreaterThan(0);
      for (const tomlPath of tomlFiles) {
        const content = fs.getFile(tomlPath) ?? "";
        const parsed = parseToml(content) as Record<string, unknown>;
        expect(typeof parsed.name).toBe("string");
        expect(typeof parsed.description).toBe("string");
        expect(typeof parsed.developer_instructions).toBe("string");
      }
    });

    it("TOML files do not contain model key (D-5)", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const tomlFiles = fs.listUnder(OUT_DIR).filter((p) => p.endsWith(".toml"));
      for (const tomlPath of tomlFiles) {
        const content = fs.getFile(tomlPath) ?? "";
        const parsed = parseToml(content) as Record<string, unknown>;
        expect(parsed.model).toBeUndefined();
      }
    });
  });

  describe("skill rewrite (AC #6)", () => {
    it("uses the skill frontmatter allowlist without changing the source", async () => {
      const fs = await makeSeededFsFromCodex();
      const sourcePath = `${CODEX_FIXTURE_DIR}/plugins/aidd-codex-fixture/skills/sample/SKILL.md`;
      const sourceBefore = await fs.readFile(sourcePath);
      const uc = makeUseCase(fs);

      await uc.execute({ sourceDir: CODEX_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });

      const output =
        fs.getFile(`${OUT_DIR}/plugins/aidd-codex-fixture/skills/sample/SKILL.md`) ?? "";
      expect(parseFrontmatter(output).frontmatter).toEqual({
        name: "sample",
        description: "Sample skill for testing reference rewriting.",
        allowed_tools: ["Read"],
      });
      expect(output).not.toMatch(/^model:/m);
      expect(await fs.readFile(sourcePath)).toBe(sourceBefore);
    });

    it("preserves auxiliary Markdown frontmatter", async () => {
      const fs = await makeSeededFsFromCodex();
      const sourcePath = `${CODEX_FIXTURE_DIR}/plugins/aidd-codex-fixture/skills/sample/assets/template.md`;
      const source = await fs.readFile(sourcePath);
      const uc = makeUseCase(fs);

      await uc.execute({ sourceDir: CODEX_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });

      const output = fs.getFile(
        `${OUT_DIR}/plugins/aidd-codex-fixture/skills/sample/assets/template.md`
      );
      expect(output).toBe(source);
      expect(parseFrontmatter(output ?? "").frontmatter).toEqual({
        name: "template",
        model: "opus",
        custom: "keep-this",
      });
    });

    it("rewrites @./ references in skill SKILL.md to markdown links", async () => {
      const fs = await makeSeededFsFromCodex();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: CODEX_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const skillOut =
        fs.getFile(`${OUT_DIR}/plugins/aidd-codex-fixture/skills/sample/SKILL.md`) ?? "";
      expect(skillOut).toContain("[neighbor.md](./neighbor.md)");
    });

    it("rewrites @../ references in skill SKILL.md to markdown links", async () => {
      const fs = await makeSeededFsFromCodex();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: CODEX_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const skillOut =
        fs.getFile(`${OUT_DIR}/plugins/aidd-codex-fixture/skills/sample/SKILL.md`) ?? "";
      expect(skillOut).toContain("[up.md](../up.md)");
    });

    it("rewrites @CLAUDE_PLUGIN_ROOT references in skill to file-relative markdown links", async () => {
      const fs = await makeSeededFsFromCodex();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: CODEX_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const skillOut =
        fs.getFile(`${OUT_DIR}/plugins/aidd-codex-fixture/skills/sample/SKILL.md`) ?? "";
      // Should not contain the raw variable reference
      expect(skillOut).not.toContain(CLAUDE_ROOT_VAR);
      // Should contain a markdown link in place of the variable reference
      expect(skillOut).toContain("[planner.md]");
    });
  });

  describe("hooks token rewrite (AC #7)", () => {
    it("hooks.json rewrites claude token to codex native token", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const destHooks = fs.getFile(`${OUT_DIR}/plugins/aidd-context/hooks/hooks.json`) ?? "";
      expect(destHooks).toContain(CODEX_ROOT_VAR);
      expect(destHooks).not.toContain(CLAUDE_ROOT_VAR);
    });

    it("hooks.json path separator preserved after token rewrite", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const destHooks = fs.getFile(`${OUT_DIR}/plugins/aidd-context/hooks/hooks.json`) ?? "";
      expect(destHooks).toContain(`${CODEX_ROOT_VAR}/hooks/`);
    });
  });

  describe("MCP byte-for-byte (AC #8)", () => {
    it(".mcp.json output matches source SHA-256 hash", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const srcMcp = fs.getFile(`${REAL_FIXTURE_DIR}/plugins/aidd-dev/.mcp.json`) ?? "";
      const destMcp = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/.mcp.json`) ?? "";
      expect(sha256(destMcp)).toBe(sha256(srcMcp));
    });
  });

  describe("agents field omitted, warn-out-of-scope (AC #9)", () => {
    it("synthesized plugin.json never has agents field even when source has agents", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const raw = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/.codex-plugin/plugin.json`) ?? "{}";
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed.agents).toBeUndefined();
    });

    it("warns and skips commands/ and rules/ directories", async () => {
      const fs = await makeSeededFsFromReal();
      // Inject commands/ and rules/ into the plugin source
      fs.setFile(`${REAL_FIXTURE_DIR}/plugins/aidd-dev/commands/foo.md`, "# Foo");
      fs.setFile(`${REAL_FIXTURE_DIR}/plugins/aidd-dev/rules/bar.md`, "# Bar");
      const logger = new CapturingLogger();
      const uc = makeUseCase(fs, undefined, logger);
      const result = await uc.execute({
        sourceDir: REAL_FIXTURE_DIR,
        outDir: OUT_DIR,
        target: "codex",
      });
      const devPlugin = result.plugins.find((p) => p.name === "aidd-dev");
      expect(devPlugin?.skippedSections).toContain("commands");
      expect(devPlugin?.skippedSections).toContain("rules");
      expect(logger.warnMessages.some((m) => m.includes("commands"))).toBe(true);
    });

    it("commands/ and rules/ directories do not appear in output", async () => {
      const fs = await makeSeededFsFromReal();
      fs.setFile(`${REAL_FIXTURE_DIR}/plugins/aidd-dev/commands/foo.md`, "# Foo");
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-dev/commands/foo.md`)).toBe(false);
    });
  });

  describe("error classes (AC #10)", () => {
    it("throws InvalidBuildPathsError when outDir equals sourceDir", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await expect(
        uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: REAL_FIXTURE_DIR, target: "codex" })
      ).rejects.toThrow(InvalidBuildPathsError);
    });

    it("throws JsonSchemaValidationError when plugin manifest fails validation", async () => {
      const fs = await makeSeededFsFromReal();
      const av = {
        validate(_schema: object, _data: unknown): void {
          throw new JsonSchemaValidationError(["fail"]);
        },
      };
      const ap = makeBundledAssetProvider();
      const strategy = new MarketplaceBuildStrategy(fs, av, ap, buildCodexContract());
      const uc = new FrameworkBuildUseCase(fs, av, ap, new CapturingLogger(), strategy);
      await expect(
        uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" })
      ).rejects.toThrow(JsonSchemaValidationError);
    });

    it("throws FrameworkPlaceholderInPluginError when skill has @{{TOOLS}}/ placeholder", async () => {
      const fs = await makeSeededFsFromReal();
      fs.setFile(
        `${REAL_FIXTURE_DIR}/plugins/aidd-dev/skills/bad/SKILL.md`,
        "# Bad\n@{{TOOLS}}/something.md\n"
      );
      const uc = makeUseCase(fs);
      await expect(
        uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" })
      ).rejects.toThrow(FrameworkPlaceholderInPluginError);
    });
  });

  describe("agent body verbatim (D-4)", () => {
    it("preserves all three reference forms in developer_instructions", async () => {
      const fs = await makeSeededFsFromCodex();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: CODEX_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const tomlContent =
        fs.getFile(`${OUT_DIR}/plugins/aidd-codex-fixture/codex-agents/test-agent.toml`) ?? "";
      const parsed = parseToml(tomlContent) as Record<string, unknown>;
      const instr = parsed.developer_instructions as string;
      expect(instr).toContain("@./foo.md");
      expect(instr).toContain("@../bar.md");
      expect(instr).toContain(CLAUDE_ROOT_VAR);
    });
  });

  describe("model key omission (D-5)", () => {
    it("fixture agent with model: opus produces TOML with no model key", async () => {
      const fs = await makeSeededFsFromCodex();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: CODEX_FIXTURE_DIR, outDir: OUT_DIR, target: "codex" });
      const tomlContent =
        fs.getFile(`${OUT_DIR}/plugins/aidd-codex-fixture/codex-agents/test-agent.toml`) ?? "";
      const parsed = parseToml(tomlContent) as Record<string, unknown>;
      expect(parsed.model).toBeUndefined();
    });
  });
});

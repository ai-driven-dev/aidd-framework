import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildClaudeContract } from "../../../../../src/contexts/tools/domain/profiles/claude/build.js";
import { MarketplaceBuildStrategy } from "../../../../../src/contexts/translate/application/strategies/marketplace-build-strategy.js";
import { FrameworkBuildUseCase } from "../../../../../src/contexts/translate/application/translate-source.js";
import { AjvSchemaValidatorAdapter } from "../../../../../src/contexts/translate/infrastructure/schema-validator.js";
import {
  FrameworkPlaceholderInPluginError,
  InvalidBuildPathsError,
  JsonSchemaValidationError,
} from "../../../../../src/kernel/errors.js";
import type { AssetProvider } from "../../../../../src/kernel/ports/asset-provider.js";
import { BundledAssetProviderAdapter } from "../../../../../src/runtime/assets/asset-loader.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const REAL_FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework-real");
// resolve(), not the bare literal: on Windows path.resolve treats a leading "/" as
// drive-relative and prepends the current drive, so production's own resolve(outDir)
// would otherwise write under a different key than this constant's raw string names.
const OUT_DIR = resolve("/tmp/aidd-claude-test-out");

// Avoid biome noTemplateCurlyInString: split literal
const CLAUDE_ROOT_VAR = "$" + "{CLAUDE_PLUGIN_ROOT}";

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
  const strategy = new MarketplaceBuildStrategy(fs, av, ap, buildClaudeContract());
  return new FrameworkBuildUseCase(fs, av, ap, logger ?? new CapturingLogger(), strategy);
}

async function makeSeededFsFromReal(): Promise<InMemoryFileAdapter> {
  const fs = new InMemoryFileAdapter();
  await seedFromDirectory(fs, REAL_FIXTURE_DIR, { useAbsolutePaths: true });
  return fs;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

describe("ClaudeOutputStrategy", () => {
  describe("tree shape (AC #1)", () => {
    let fs: InMemoryFileAdapter;

    beforeEach(async () => {
      fs = await makeSeededFsFromReal();
    });

    it("emits .claude-plugin/marketplace.json in output root", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      expect(fs.has(`${OUT_DIR}/.claude-plugin/marketplace.json`)).toBe(true);
    });

    it("emits .claude-plugin/plugin.json for each plugin", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-dev/.claude-plugin/plugin.json`)).toBe(true);
    });

    it("emits agents/*.md for plugins with agents", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      const agentFiles = fs.listUnder(`${OUT_DIR}/plugins/aidd-dev/agents`);
      expect(agentFiles.length).toBeGreaterThan(0);
      expect(agentFiles.every((f) => f.endsWith(".md"))).toBe(true);
    });

    it("emits skills tree for plugins with skills", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      const skillFiles = fs.listUnder(`${OUT_DIR}/plugins/aidd-context/skills`);
      expect(skillFiles.length).toBeGreaterThan(0);
    });

    it("emits hooks files for plugins with hooks", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-context/hooks/hooks.json`)).toBe(true);
    });

    it("emits .mcp.json for plugins with MCP", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-dev/.mcp.json`)).toBe(true);
    });
  });

  describe("plugin manifest schema valid (D-7)", () => {
    it("synthesized plugin.json validates against bundled claude-code-plugin-manifest.json schema", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      const raw = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/.claude-plugin/plugin.json`) ?? "{}";
      const parsed = JSON.parse(raw) as unknown;
      const av = new AjvSchemaValidatorAdapter();
      const schema = new BundledAssetProviderAdapter().loadSchema("plugin-manifest");
      expect(() => av.validate(schema, parsed)).not.toThrow();
    });
  });

  describe("marketplace schema valid (AC #1)", () => {
    it("emitted marketplace.json validates against bundled claude-marketplace-manifest.json schema", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      const raw = fs.getFile(`${OUT_DIR}/.claude-plugin/marketplace.json`) ?? "{}";
      const parsed = JSON.parse(raw) as unknown;
      const av = new AjvSchemaValidatorAdapter();
      const schema = new BundledAssetProviderAdapter().loadSchema("claude-marketplace");
      expect(() => av.validate(schema, parsed)).not.toThrow();
    });

    it("emitted marketplace.json has Claude-shape plugins with source: ./plugins/<name>", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      const raw = fs.getFile(`${OUT_DIR}/.claude-plugin/marketplace.json`) ?? "{}";
      const parsed = JSON.parse(raw) as { plugins: { name: string; source: string }[] };
      const devPlugin = parsed.plugins.find((p) => p.name === "aidd-dev");
      expect(devPlugin?.source).toBe("./plugins/aidd-dev");
    });
  });

  describe("plugin manifest has agents field (AC #7)", () => {
    it("synthesized plugin.json lists ./agents/*.md file paths when source has agents", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      const raw = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/.claude-plugin/plugin.json`) ?? "{}";
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed.agents).toEqual([
        "./agents/implementer.md",
        "./agents/planner.md",
        "./agents/reviewer.md",
      ]);
    });

    it("synthesized plugin.json omits agents when no agents present", async () => {
      const fs = await makeSeededFsFromReal();
      for (const p of fs.listUnder(`${REAL_FIXTURE_DIR}/plugins/aidd-pm/agents`)) {
        fs.deleteFile(p);
      }
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      const raw = fs.getFile(`${OUT_DIR}/plugins/aidd-pm/.claude-plugin/plugin.json`) ?? "{}";
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed.agents).toBeUndefined();
    });
  });

  describe("agent frontmatter preserved (D-5)", () => {
    it("source agent with tools/color/model — claude output preserves all frontmatter keys", async () => {
      const fs = await makeSeededFsFromReal();
      fs.setFile(
        `${REAL_FIXTURE_DIR}/plugins/aidd-dev/agents/full-agent.md`,
        "---\nname: full-agent\ndescription: Full agent\nmodel: claude-sonnet\ntools:\n  - Read\n  - Write\ncolor: '#ff0000'\n---\n\nBody with @./foo.md ref."
      );
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      const out = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/agents/full-agent.md`) ?? "";
      expect(out).toContain("tools:");
      expect(out).toContain("color:");
      expect(out).toContain("model:");
      expect(out).toContain("name:");
    });

    it("agent body gets @./ rewrite (D-4)", async () => {
      const fs = await makeSeededFsFromReal();
      fs.setFile(
        `${REAL_FIXTURE_DIR}/plugins/aidd-dev/agents/link-agent.md`,
        "---\nname: link-agent\ndescription: test\n---\n\n@./foo.md\n@../bar.md"
      );
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      const out = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/agents/link-agent.md`) ?? "";
      expect(out).toContain("[foo.md](./foo.md)");
      expect(out).toContain("[bar.md](../bar.md)");
    });
  });

  describe("hooks byte-for-byte (D-6)", () => {
    it("hooks.json output matches source SHA-256 hash", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      const srcHooks =
        fs.getFile(`${REAL_FIXTURE_DIR}/plugins/aidd-context/hooks/hooks.json`) ?? "";
      const destHooks = fs.getFile(`${OUT_DIR}/plugins/aidd-context/hooks/hooks.json`) ?? "";
      expect(sha256(destHooks)).toBe(sha256(srcHooks));
    });

    it("hooks.json output preserves CLAUDE_PLUGIN_ROOT (not rewritten)", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      const destHooks = fs.getFile(`${OUT_DIR}/plugins/aidd-context/hooks/hooks.json`) ?? "";
      expect(destHooks).toContain(CLAUDE_ROOT_VAR);
    });
  });

  describe("MCP byte-for-byte (D-6)", () => {
    it(".mcp.json output matches source SHA-256 hash", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      const srcMcp = fs.getFile(`${REAL_FIXTURE_DIR}/plugins/aidd-dev/.mcp.json`) ?? "";
      const destMcp = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/.mcp.json`) ?? "";
      expect(sha256(destMcp)).toBe(sha256(srcMcp));
    });
  });

  describe("idempotency (AC #4)", () => {
    it("produces byte-identical output on two consecutive runs", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      const opts = { sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" as const };
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

  describe("out-of-scope sections (AC #6)", () => {
    it("warns and skips commands/ and rules/ directories", async () => {
      const fs = await makeSeededFsFromReal();
      fs.setFile(`${REAL_FIXTURE_DIR}/plugins/aidd-dev/commands/foo.md`, "# Foo");
      fs.setFile(`${REAL_FIXTURE_DIR}/plugins/aidd-dev/rules/bar.md`, "# Bar");
      const logger = new CapturingLogger();
      const uc = makeUseCase(fs, undefined, logger);
      const result = await uc.execute({
        sourceDir: REAL_FIXTURE_DIR,
        outDir: OUT_DIR,
        target: "claude",
      });
      const devPlugin = result.plugins.find((p) => p.name === "aidd-dev");
      expect(devPlugin?.skippedSections).toContain("commands");
      expect(devPlugin?.skippedSections).toContain("rules");
      expect(logger.warnMessages.some((m) => m.includes("commands"))).toBe(true);
    });

    it("commands/ and rules/ do not appear in output", async () => {
      const fs = await makeSeededFsFromReal();
      fs.setFile(`${REAL_FIXTURE_DIR}/plugins/aidd-dev/commands/foo.md`, "# Foo");
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-dev/commands/foo.md`)).toBe(false);
    });
  });

  describe("error classes", () => {
    it("throws InvalidBuildPathsError when outDir equals sourceDir (AC #5)", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await expect(
        uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: REAL_FIXTURE_DIR, target: "claude" })
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
      const strategy = new MarketplaceBuildStrategy(fs, av, ap, buildClaudeContract());
      const uc = new FrameworkBuildUseCase(fs, av, ap, new CapturingLogger(), strategy);
      await expect(
        uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" })
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
        uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "claude" })
      ).rejects.toThrow(FrameworkPlaceholderInPluginError);
    });
  });
});

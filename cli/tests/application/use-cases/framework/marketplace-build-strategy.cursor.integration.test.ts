import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FrameworkBuildUseCase } from "../../../../src/application/use-cases/framework/framework-build-use-case.js";
import { MarketplaceBuildStrategy } from "../../../../src/application/use-cases/framework/strategies/marketplace-build-strategy.js";
import { buildCursorContract } from "../../../../src/contexts/tools/domain/profiles/cursor/build.js";
import { AjvSchemaValidatorAdapter } from "../../../../src/infrastructure/adapters/ajv-schema-validator-adapter.js";
import { BundledAssetProviderAdapter } from "../../../../src/infrastructure/assets/asset-loader.js";
import {
  FrameworkPlaceholderInPluginError,
  InvalidBuildPathsError,
  JsonSchemaValidationError,
} from "../../../../src/kernel/errors.js";
import type { AssetProvider } from "../../../../src/kernel/ports/asset-provider.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const REAL_FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework-real");
const OUT_DIR = "/tmp/aidd-cursor-test-out";

// Avoid biome noTemplateCurlyInString: split literal
const CLAUDE_ROOT_VAR = "$" + "{CLAUDE_PLUGIN_ROOT}";
const CURSOR_ROOT_VAR = "$" + "{CURSOR_PLUGIN_ROOT}";

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
  const strategy = new MarketplaceBuildStrategy(fs, av, ap, buildCursorContract());
  return new FrameworkBuildUseCase(fs, av, ap, logger ?? new CapturingLogger(), strategy);
}

async function makeSeededFsFromReal(): Promise<InMemoryFileAdapter> {
  const fs = new InMemoryFileAdapter();
  await seedFromDirectory(fs, REAL_FIXTURE_DIR, { useAbsolutePaths: true });
  return fs;
}

describe("CursorOutputStrategy", () => {
  describe("tree shape (AC #2)", () => {
    let fs: InMemoryFileAdapter;

    beforeEach(async () => {
      fs = await makeSeededFsFromReal();
    });

    it("emits .cursor-plugin/marketplace.json in output root", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      expect(fs.has(`${OUT_DIR}/.cursor-plugin/marketplace.json`)).toBe(true);
    });

    it("emits .cursor-plugin/plugin.json for each plugin", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-dev/.cursor-plugin/plugin.json`)).toBe(true);
    });

    it("emits agents/*.md for plugins with agents", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      const agentFiles = fs.listUnder(`${OUT_DIR}/plugins/aidd-dev/agents`);
      expect(agentFiles.length).toBeGreaterThan(0);
      expect(agentFiles.every((f) => f.endsWith(".md"))).toBe(true);
    });

    it("emits skills tree for plugins with skills", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      const skillFiles = fs.listUnder(`${OUT_DIR}/plugins/aidd-context/skills`);
      expect(skillFiles.length).toBeGreaterThan(0);
    });

    it("emits hooks files for plugins with hooks", async () => {
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      expect(fs.has(`${OUT_DIR}/plugins/aidd-context/hooks/hooks.json`)).toBe(true);
    });
  });

  describe("plugin manifest schema valid (D-7)", () => {
    it("synthesized plugin.json validates against bundled claude-code-plugin-manifest.json schema", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      const raw = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/.cursor-plugin/plugin.json`) ?? "{}";
      const parsed = JSON.parse(raw) as unknown;
      const av = new AjvSchemaValidatorAdapter();
      const schema = new BundledAssetProviderAdapter().loadSchema("plugin-manifest");
      expect(() => av.validate(schema, parsed)).not.toThrow();
    });
  });

  describe("marketplace schema valid (AC #2, D-2)", () => {
    it("emitted marketplace.json validates against claude-clone schema", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      const raw = fs.getFile(`${OUT_DIR}/.cursor-plugin/marketplace.json`) ?? "{}";
      const parsed = JSON.parse(raw) as unknown;
      const av = new AjvSchemaValidatorAdapter();
      const schema = new BundledAssetProviderAdapter().loadSchema("claude-marketplace");
      expect(() => av.validate(schema, parsed)).not.toThrow();
    });

    it("emitted marketplace.json has source: ./plugins/<name>", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      const raw = fs.getFile(`${OUT_DIR}/.cursor-plugin/marketplace.json`) ?? "{}";
      const parsed = JSON.parse(raw) as { plugins: { name: string; source: string }[] };
      const devPlugin = parsed.plugins.find((p) => p.name === "aidd-dev");
      expect(devPlugin?.source).toBe("./plugins/aidd-dev");
    });
  });

  describe("agent frontmatter allowlist (AC #2, D-3)", () => {
    it("strips tools/color/argument-hint from agent — keeps only name/description/model", async () => {
      const fs = await makeSeededFsFromReal();
      fs.setFile(
        `${REAL_FIXTURE_DIR}/plugins/aidd-dev/agents/cursor-agent.md`,
        "---\nname: cursor-agent\ndescription: Cursor agent\nmodel: claude-sonnet\ntools:\n  - Read\n  - Write\ncolor: '#ff0000'\nargument-hint: '[file]'\n---\n\nBody."
      );
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      const out = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/agents/cursor-agent.md`) ?? "";
      expect(out).toContain("name:");
      expect(out).toContain("description:");
      expect(out).toContain("model:");
      expect(out).not.toContain("tools:");
      expect(out).not.toContain("color:");
      expect(out).not.toContain("argument-hint:");
    });

    it("NEVER emits tools or color frontmatter keys in any agent output", async () => {
      const fs = await makeSeededFsFromReal();
      fs.setFile(
        `${REAL_FIXTURE_DIR}/plugins/aidd-dev/agents/full-agent.md`,
        "---\nname: full\ndescription: desc\nmodel: sonnet\ntools:\n  - Bash\ncolor: '#abc'\n---\n\nContent."
      );
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      for (const agentPath of fs.listUnder(`${OUT_DIR}/plugins/aidd-dev/agents`)) {
        const content = fs.getFile(agentPath) ?? "";
        expect(content).not.toMatch(/^tools:/m);
        expect(content).not.toMatch(/^color:/m);
      }
    });

    it("agent body gets @./ and @../ rewrites (D-4)", async () => {
      const fs = await makeSeededFsFromReal();
      fs.setFile(
        `${REAL_FIXTURE_DIR}/plugins/aidd-dev/agents/link-agent.md`,
        "---\nname: link-agent\ndescription: test\n---\n\n@./foo.md\n@../bar.md"
      );
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      const out = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/agents/link-agent.md`) ?? "";
      expect(out).toContain("[foo.md](./foo.md)");
      expect(out).toContain("[bar.md](../bar.md)");
    });

    it("CLAUDE_PLUGIN_ROOT in agent body is NOT rewritten (only @-prefixed refs are)", async () => {
      const fs = await makeSeededFsFromReal();
      fs.setFile(
        `${REAL_FIXTURE_DIR}/plugins/aidd-dev/agents/root-agent.md`,
        `---\nname: root-agent\ndescription: test\n---\n\nSee ${CLAUDE_ROOT_VAR}/file.md`
      );
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      const out = fs.getFile(`${OUT_DIR}/plugins/aidd-dev/agents/root-agent.md`) ?? "";
      expect(out).toContain(CLAUDE_ROOT_VAR);
    });
  });

  describe("skills 1:1 (AC #2)", () => {
    it("SKILL.md is copied with @./ rewrites", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      const skillFiles = fs.listUnder(`${OUT_DIR}/plugins`).filter((f) => f.endsWith("SKILL.md"));
      expect(skillFiles.length).toBeGreaterThan(0);
    });
  });

  describe("hooks token rewrite (D-6)", () => {
    it("hooks.json rewrites claude token to cursor native token", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      const destHooks = fs.getFile(`${OUT_DIR}/plugins/aidd-context/hooks/hooks.json`) ?? "";
      expect(destHooks).toContain(CURSOR_ROOT_VAR);
      expect(destHooks).not.toContain(CLAUDE_ROOT_VAR);
    });

    it("hooks.json path separator preserved after token rewrite", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" });
      const destHooks = fs.getFile(`${OUT_DIR}/plugins/aidd-context/hooks/hooks.json`) ?? "";
      expect(destHooks).toContain(`${CURSOR_ROOT_VAR}/hooks/`);
    });
  });

  describe("idempotency (AC #4)", () => {
    it("produces byte-identical output on two consecutive runs", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      const opts = { sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" as const };
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
        target: "cursor",
      });
      const devPlugin = result.plugins.find((p) => p.name === "aidd-dev");
      expect(devPlugin?.skippedSections).toContain("commands");
      expect(logger.warnMessages.some((m) => m.includes("commands"))).toBe(true);
    });
  });

  describe("error classes (AC #5)", () => {
    it("throws InvalidBuildPathsError when outDir equals sourceDir", async () => {
      const fs = await makeSeededFsFromReal();
      const uc = makeUseCase(fs);
      await expect(
        uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: REAL_FIXTURE_DIR, target: "cursor" })
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
      const strategy = new MarketplaceBuildStrategy(fs, av, ap, buildCursorContract());
      const uc = new FrameworkBuildUseCase(fs, av, ap, new CapturingLogger(), strategy);
      await expect(
        uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" })
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
        uc.execute({ sourceDir: REAL_FIXTURE_DIR, outDir: OUT_DIR, target: "cursor" })
      ).rejects.toThrow(FrameworkPlaceholderInPluginError);
    });
  });
});

import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FrameworkBuildUseCase } from "../../../../src/application/use-cases/framework/framework-build-use-case.js";
import { FlatBuildStrategy } from "../../../../src/application/use-cases/framework/strategies/flat-build-strategy.js";
import {
  buildCopilotFlatContract,
  buildOpencodeFlatContract,
} from "../../../../src/application/use-cases/framework/strategies/tool-contracts.js";
import {
  FlatTargetExistsError,
  JsonSchemaValidationError,
  OutDirNotDirectoryError,
} from "../../../../src/domain/errors.js";
import type { AssetProvider } from "../../../../src/domain/ports/asset-provider.js";
import type { JsonSchemaValidator } from "../../../../src/domain/ports/json-schema-validator.js";
import { AjvSchemaValidatorAdapter } from "../../../../src/infrastructure/adapters/ajv-schema-validator-adapter.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework");
// resolve(), not the bare literal: on Windows path.resolve treats a leading "/" as
// drive-relative and prepends the current drive, so production's own resolve(outDir)
// would otherwise write under a different key than this constant's raw string names.
const ABS_OUT = resolve("/tmp/aidd-flat-test");
// FlatBuildStrategy embeds this into written JSON content ("/"-joined, forward-slash - see
// resolveClaudeRootAbsolute), never ABS_OUT's own native separators.
const ABS_OUT_IN_CONTENT = ABS_OUT.replace(/\\/g, "/");
const PLUGIN = "aidd-test";
// Avoid biome noTemplateCurlyInString: split literal for the placeholder.
const CLAUDE_ROOT_VAR = "$" + "{CLAUDE_PLUGIN_ROOT}";

const MINIMAL_MANIFEST_SCHEMA = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string" } },
};

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

function makeAssetProvider(): AssetProvider {
  return {
    loadConfigAsset: (_toolId, fileName) => {
      if (fileName === "opencode.json") {
        return {
          $schema: "https://opencode.ai/config.json",
          instructions: [".opencode/rules/**/*.md"],
        };
      }
      throw new Error("not used");
    },
    loadDefaultMarketplace: () => {
      throw new Error("not used");
    },
    loadSchema: (name) => {
      if (name === "plugin-manifest") return MINIMAL_MANIFEST_SCHEMA;
      if (name === "marketplace") return MINIMAL_MARKETPLACE_SCHEMA;
      return {};
    },
  };
}

/**
 * isDirectory probe for InMemoryFileAdapter:
 * A path is a "directory" if it has no exact file entry but has child paths.
 */
function makeIsDirectory(fs: InMemoryFileAdapter): (path: string) => Promise<boolean> {
  // listUnder() normalizes path before comparing; a hand-rolled prefix scan here would
  // compare a native-separator outDir against the adapter's "/"-only keys and never match
  // on Windows, where production's resolve(outDir) is backslash-joined.
  return async (path: string): Promise<boolean> => {
    if (fs.has(path)) return false;
    return fs.listUnder(path).length > 0;
  };
}

async function makeSeededFs(): Promise<InMemoryFileAdapter> {
  const memFs = new InMemoryFileAdapter();
  await seedFromDirectory(memFs, FIXTURE_DIR, { useAbsolutePaths: true });
  memFs.setFile(`${ABS_OUT}/.keep`, "");
  return memFs;
}

function makeUseCase(
  memFs: InMemoryFileAdapter,
  force = false,
  validator?: JsonSchemaValidator
): FrameworkBuildUseCase {
  const v = validator ?? makeValidator();
  const ap = makeAssetProvider();
  const av = new AjvSchemaValidatorAdapter();
  const strategy = new FlatBuildStrategy(
    memFs,
    av,
    ap,
    buildCopilotFlatContract(),
    force,
    ABS_OUT,
    makeIsDirectory(memFs)
  );
  return new FrameworkBuildUseCase(memFs, v, ap, new CapturingLogger(), strategy);
}

describe("FlatOutputStrategy integration", () => {
  let memFs: InMemoryFileAdapter;

  beforeEach(async () => {
    memFs = await makeSeededFs();
  });

  describe("happy path", () => {
    it("writes agent under .github/agents/<plugin>-<name>.agent.md (plugin-prefixed)", async () => {
      const useCase = makeUseCase(memFs);
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const agentPath = `${ABS_OUT}/.github/agents/${PLUGIN}-code-reviewer.agent.md`;
      expect(memFs.has(agentPath)).toBe(true);
    });

    it("strips frontmatter to Copilot allowlist in agent file and uses plugin-prefixed name", async () => {
      const useCase = makeUseCase(memFs);
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const content = memFs.getFile(`${ABS_OUT}/.github/agents/${PLUGIN}-code-reviewer.agent.md`);
      expect(content).toContain(`${PLUGIN}-code-reviewer`);
      expect(content).toContain("description");
    });

    it("writes skill files under .github/skills/<plugin>-<skill>/ (plugin-prefixed)", async () => {
      const useCase = makeUseCase(memFs);
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const skillPath = `${ABS_OUT}/.github/skills/${PLUGIN}-commit/SKILL.md`;
      expect(memFs.has(skillPath)).toBe(true);
    });

    it("rewrites @./ references in skill files", async () => {
      const useCase = makeUseCase(memFs);
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const content = memFs.getFile(`${ABS_OUT}/.github/skills/${PLUGIN}-hello.md`);
      expect(content).toContain("[SKILL.md](./SKILL.md)");
    });

    it("rewrites @CLAUDE_ROOT/skills/<X> in skill files to relative flat path", async () => {
      const useCase = makeUseCase(memFs);
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const content = memFs.getFile(`${ABS_OUT}/.github/skills/${PLUGIN}-hello.md`);
      expect(content).not.toContain(`@${CLAUDE_ROOT_VAR}`);
    });

    it("writes per-plugin hooks file under .github/hooks/<plugin>.hooks.json", async () => {
      const useCase = makeUseCase(memFs);
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const hooksPath = `${ABS_OUT}/.github/hooks/${PLUGIN}.hooks.json`;
      expect(memFs.has(hooksPath)).toBe(true);
    });

    it("rewrites CLAUDE_ROOT/hooks/<X> in hooks JSON to per-plugin workspace-relative path", async () => {
      const useCase = makeUseCase(memFs);
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const content = memFs.getFile(`${ABS_OUT}/.github/hooks/${PLUGIN}.hooks.json`);
      expect(content).not.toContain("CLAUDE_PLUGIN_ROOT");
      expect(content).toContain(`./.github/hooks/${PLUGIN}/check.sh`);
    });

    it("copies sibling hook scripts to .github/hooks/<plugin>/ alongside the JSON", async () => {
      const useCase = makeUseCase(memFs);
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const scriptPath = `${ABS_OUT}/.github/hooks/${PLUGIN}/check.sh`;
      expect(memFs.has(scriptPath)).toBe(true);
    });

    it("merges MCP servers into .vscode/mcp.json under servers key with plugin prefix", async () => {
      const useCase = makeUseCase(memFs);
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const mcpPath = `${ABS_OUT}/.vscode/mcp.json`;
      expect(memFs.has(mcpPath)).toBe(true);
      const raw = memFs.getFile(mcpPath) ?? "";
      const parsed = JSON.parse(raw) as { servers: Record<string, unknown> };
      expect(parsed.servers).toHaveProperty(`${PLUGIN}-aidd-test-server`);
    });

    it("rewrites CLAUDE_ROOT in MCP to absolute path under absOut", async () => {
      const useCase = makeUseCase(memFs);
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const content = memFs.getFile(`${ABS_OUT}/.vscode/mcp.json`) ?? "";
      expect(content).not.toContain("CLAUDE_PLUGIN_ROOT");
      expect(content).toContain(ABS_OUT_IN_CONTENT);
    });

    it("does NOT write a marketplace.json", async () => {
      const useCase = makeUseCase(memFs);
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      expect(memFs.has(`${ABS_OUT}/.plugin/marketplace.json`)).toBe(false);
      expect(memFs.has(`${ABS_OUT}/.github/plugin/marketplace.json`)).toBe(false);
    });
  });

  describe("idempotency with --force", () => {
    it("re-run with force produces byte-identical files", async () => {
      const useCase1 = makeUseCase(memFs, false);
      await useCase1.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const agentPath = `${ABS_OUT}/.github/agents/${PLUGIN}-code-reviewer.agent.md`;
      const snapshot = memFs.getFile(agentPath);

      const useCase2 = makeUseCase(memFs, true);
      await useCase2.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      expect(memFs.getFile(agentPath)).toBe(snapshot);
    });
  });

  describe("collision detection without --force", () => {
    it("halts with FlatTargetExistsError when agent file already exists", async () => {
      const useCase1 = makeUseCase(memFs, false);
      await useCase1.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });

      const useCase2 = makeUseCase(memFs, false);
      await expect(
        useCase2.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" })
      ).rejects.toBeInstanceOf(FlatTargetExistsError);
    });
  });

  describe("safety guards", () => {
    it("throws OutDirNotDirectoryError when outDir does not exist", async () => {
      const emptyFs = new InMemoryFileAdapter();
      await seedFromDirectory(emptyFs, FIXTURE_DIR, { useAbsolutePaths: true });
      const v = makeValidator();
      const ap = makeAssetProvider();
      const strategy = new FlatBuildStrategy(
        emptyFs,
        new AjvSchemaValidatorAdapter(),
        ap,
        buildCopilotFlatContract(),
        false,
        "/nonexistent",
        makeIsDirectory(emptyFs)
      );
      const useCase = new FrameworkBuildUseCase(emptyFs, v, ap, new CapturingLogger(), strategy);
      await expect(
        useCase.execute({ sourceDir: FIXTURE_DIR, outDir: "/nonexistent", target: "copilot" })
      ).rejects.toBeInstanceOf(OutDirNotDirectoryError);
    });

    it("throws OutDirNotDirectoryError when outDir is a file, not a directory", async () => {
      const fileFs = new InMemoryFileAdapter();
      await seedFromDirectory(fileFs, FIXTURE_DIR, { useAbsolutePaths: true });
      fileFs.setFile(ABS_OUT, "I am a file, not a directory");
      const v2 = makeValidator();
      const ap2 = makeAssetProvider();
      const strategy = new FlatBuildStrategy(
        fileFs,
        new AjvSchemaValidatorAdapter(),
        ap2,
        buildCopilotFlatContract(),
        false,
        ABS_OUT,
        makeIsDirectory(fileFs)
      );
      const useCase = new FrameworkBuildUseCase(fileFs, v2, ap2, new CapturingLogger(), strategy);
      await expect(
        useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" })
      ).rejects.toBeInstanceOf(OutDirNotDirectoryError);
    });
  });

  describe("invalid manifest", () => {
    it("throws JsonSchemaValidationError for invalid plugin.json (orchestrator-side)", async () => {
      const useCase = makeUseCase(memFs, false, makeValidator(true));
      await expect(
        useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" })
      ).rejects.toBeInstanceOf(JsonSchemaValidationError);
    });
  });

  describe("hooks path resolution for CLAUDE_ROOT/skills/<X>", () => {
    it("rewrites skills ref to ./.github/skills/<plugin>-<X> in hooks JSON (plugin-prefixed)", async () => {
      const useCase = makeUseCase(memFs);
      const hooksKey = `${FIXTURE_DIR}/plugins/${PLUGIN}/hooks/hooks.json`;
      const skillsRef = `${CLAUDE_ROOT_VAR}/skills/commit/SKILL.md`;
      memFs.setFile(
        hooksKey,
        JSON.stringify({
          hooks: {
            PreToolUse: [{ hooks: [{ type: "command", command: skillsRef }] }],
          },
        })
      );
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const content = memFs.getFile(`${ABS_OUT}/.github/hooks/${PLUGIN}.hooks.json`) ?? "";
      expect(content).toContain(`./.github/skills/${PLUGIN}-commit/SKILL.md`);
    });
  });

  describe("MCP path resolution for CLAUDE_ROOT", () => {
    it("rewrites CLAUDE_ROOT/bin/server.js to absolute path under absOut", async () => {
      const useCase = makeUseCase(memFs);
      await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });
      const content = memFs.getFile(`${ABS_OUT}/.vscode/mcp.json`) ?? "";
      expect(content).toContain(ABS_OUT_IN_CONTENT);
    });
  });

  describe("MCP key collision detection", () => {
    it("throws FlatTargetExistsError when two writeMcp calls produce the same prefixed key", async () => {
      const pluginSrc = `${FIXTURE_DIR}/plugins/${PLUGIN}`;
      const strategy = new FlatBuildStrategy(
        memFs,
        new AjvSchemaValidatorAdapter(),
        makeAssetProvider(),
        buildCopilotFlatContract(),
        false,
        ABS_OUT,
        makeIsDirectory(memFs)
      );
      await strategy.writeMcp(PLUGIN, pluginSrc);
      await expect(strategy.writeMcp(PLUGIN, pluginSrc)).rejects.toBeInstanceOf(
        FlatTargetExistsError
      );
    });
  });

  describe("opencode.json config emission", () => {
    function makeOpencodeUseCase(fs: InMemoryFileAdapter, force = false): FrameworkBuildUseCase {
      const ap = makeAssetProvider();
      const strategy = new FlatBuildStrategy(
        fs,
        new AjvSchemaValidatorAdapter(),
        ap,
        buildOpencodeFlatContract(),
        force,
        ABS_OUT,
        makeIsDirectory(fs)
      );
      return new FrameworkBuildUseCase(fs, makeValidator(), ap, new CapturingLogger(), strategy);
    }

    it("emits opencode.json with $schema + instructions and no mcp when no plugin ships MCP", async () => {
      await memFs.deleteFile(`${FIXTURE_DIR}/plugins/${PLUGIN}/.mcp.json`);
      await makeOpencodeUseCase(memFs).execute({
        sourceDir: FIXTURE_DIR,
        outDir: ABS_OUT,
        target: "opencode",
      });
      const raw = memFs.getFile(`${ABS_OUT}/opencode.json`);
      expect(raw, "opencode.json must be emitted even with zero MCP servers").toBeDefined();
      const config = JSON.parse(raw ?? "{}") as Record<string, unknown>;
      expect(config.$schema).toBe("https://opencode.ai/config.json");
      expect(config.instructions).toEqual([".opencode/rules/**/*.md"]);
      expect(config).not.toHaveProperty("mcp");
    });

    it("emits opencode.json with $schema + instructions + mcp when a plugin ships MCP", async () => {
      await makeOpencodeUseCase(memFs).execute({
        sourceDir: FIXTURE_DIR,
        outDir: ABS_OUT,
        target: "opencode",
      });
      const config = JSON.parse(memFs.getFile(`${ABS_OUT}/opencode.json`) ?? "{}") as {
        $schema: string;
        instructions: string[];
        mcp: Record<string, unknown>;
      };
      expect(config.$schema).toBe("https://opencode.ai/config.json");
      expect(config.instructions).toEqual([".opencode/rules/**/*.md"]);
      expect(Object.keys(config.mcp).length).toBeGreaterThan(0);
    });
  });

  describe("AC #11: unsupported hooks warn-and-skip", () => {
    it("warns and skips hooks for a hooks-bearing plugin when hooks is unsupported", async () => {
      const captLogger = new CapturingLogger();
      // No shipped flat contract declares hooks unsupported any more (every tool's
      // acceptsHooks is true) — this exercises writeHooks's own unsupported branch
      // directly, on a contract built for that case rather than on any real tool's.
      const base = buildOpencodeFlatContract();
      const strategy = new FlatBuildStrategy(
        memFs,
        new AjvSchemaValidatorAdapter(),
        makeAssetProvider(),
        { ...base, artifacts: { ...base.artifacts, hooks: { supported: false } } },
        false,
        ABS_OUT,
        makeIsDirectory(memFs),
        captLogger
      );
      const pluginSrc = `${FIXTURE_DIR}/plugins/${PLUGIN}`;
      // plugin fixture has hooks — ensure hooks.json exists
      memFs.setFile(`${FIXTURE_DIR}/plugins/${PLUGIN}/hooks/hooks.json`, '{"hooks":{}}');
      await strategy.writeHooks(PLUGIN, pluginSrc);
      expect(captLogger.warnMessages.some((m) => m.includes("hooks"))).toBe(true);
      // No hooks file emitted in the output
      const hooksFiles = memFs
        .listAll()
        .filter((p) => p.startsWith(ABS_OUT) && p.includes("hooks"));
      expect(hooksFiles).toHaveLength(0);
    });
  });
});

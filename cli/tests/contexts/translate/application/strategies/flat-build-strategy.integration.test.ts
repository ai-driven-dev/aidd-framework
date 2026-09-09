import { basename, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  ArtifactContract,
  ToolBuildContract,
} from "../../../../../src/contexts/tools/domain/build-contract.js";
import type { JsonSchemaValidator } from "../../../../../src/contexts/tools/domain/ports/schema-validator.js";
import { buildCopilotFlatContract } from "../../../../../src/contexts/tools/domain/profiles/copilot/build.js";
import { buildOpencodeFlatContract } from "../../../../../src/contexts/tools/domain/profiles/opencode/build.js";
import { FlatBuildStrategy } from "../../../../../src/contexts/translate/application/strategies/flat-build-strategy.js";
import { FrameworkBuildUseCase } from "../../../../../src/contexts/translate/application/translate-source.js";
import { AjvSchemaValidatorAdapter } from "../../../../../src/contexts/translate/infrastructure/schema-validator.js";
import {
  FlatTargetExistsError,
  FrameworkPlaceholderInPluginError,
  JsonSchemaValidationError,
  OutDirNotDirectoryError,
} from "../../../../../src/kernel/errors.js";
import type { AssetProvider } from "../../../../../src/kernel/ports/asset-provider.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework");
// resolve(), not the bare literal: on Windows path.resolve prepends the current drive to a
// leading "/", so production's own resolve(outDir) would key writes under a different name.
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
    loadSchema: (name) => {
      if (name === "plugin-manifest") return MINIMAL_MANIFEST_SCHEMA;
      if (name === "marketplace") return MINIMAL_MARKETPLACE_SCHEMA;
      return {};
    },
  };
}

function makeIsDirectory(fs: InMemoryFileAdapter): (path: string) => Promise<boolean> {
  // listUnder() normalizes before comparing; a hand-rolled prefix scan would compare a
  // native-separator outDir against the adapter's "/"-only keys and never match on Windows.
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
      // No shipped flat contract declares hooks unsupported any more, so this exercises
      // writeHooks's own unsupported branch on a contract built for that case.
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
      memFs.setFile(`${FIXTURE_DIR}/plugins/${PLUGIN}/hooks/hooks.json`, '{"hooks":{}}');
      await strategy.writeHooks(PLUGIN, pluginSrc);
      expect(captLogger.warnMessages.some((m) => m.includes("hooks"))).toBe(true);
      const hooksFiles = memFs
        .listAll()
        .filter((p) => p.startsWith(ABS_OUT) && p.includes("hooks"));
      expect(hooksFiles).toHaveLength(0);
    });
  });
});

/** A layout stated in the test itself: the shipped contracts cover no artifact that declares
 * no transform, no extension and no merge, and those are the branches a flat build turns on. */
const STUB_OUT = resolve("/tmp/aidd-flat-stub-test");
const STUB_PLUGIN_SRC = "/src/plugins/aidd-test";

function supportedArtifact(
  path: (plugin: string, relPath: string) => string,
  extra: Partial<Extract<ArtifactContract, { supported: true }>> = {}
): ArtifactContract {
  return {
    supported: true,
    source: { kind: "fullTree", srcDir: "." },
    path,
    ...extra,
  };
}

function stubContract(over: Partial<ToolBuildContract> = {}): ToolBuildContract {
  return {
    manifestFileRelative: null,
    synthesizeManifest: null,
    manifestSchemaName: null,
    artifacts: {
      agents: supportedArtifact((plugin, rel) => `.stub/agents/${plugin}-${rel.slice(7)}`),
      skills: supportedArtifact((plugin, rel) => `.stub/skills/${plugin}/${rel.slice(7)}`),
      hooks: supportedArtifact((plugin, rel) => `.stub/hooks/${plugin}/${rel.slice(6)}`),
      mcp: { supported: false },
      rules: { supported: false },
      commands: { supported: false },
    },
    buildMarketplaceCatalog: null,
    buildMarketplaceEntry: null,
    ...over,
  };
}

function stubStrategy(
  memFs: InMemoryFileAdapter,
  contract: ToolBuildContract,
  logger?: CapturingLogger
): FlatBuildStrategy {
  return new FlatBuildStrategy(
    memFs,
    new AjvSchemaValidatorAdapter(),
    makeAssetProvider(),
    contract,
    false,
    STUB_OUT,
    makeIsDirectory(memFs),
    logger
  );
}

function writtenUnder(memFs: InMemoryFileAdapter, dir: string): Record<string, string | undefined> {
  return Object.fromEntries(memFs.listUnder(dir).map((path) => [path, memFs.getFile(path)]));
}

describe("the agents a flat layout writes", () => {
  const reviewer = "---\nname: reviewer\n---\n\nReview the diff.\n";

  it("writes each agent markdown at the path the layout names, and nothing else under agents/", async () => {
    const memFs = new InMemoryFileAdapter({
      [`${STUB_PLUGIN_SRC}/agents/reviewer.md`]: reviewer,
      [`${STUB_PLUGIN_SRC}/agents/notes.txt`]: "not an agent",
    });
    const written = await stubStrategy(memFs, stubContract()).writeAgents(
      "aidd-test",
      STUB_PLUGIN_SRC
    );
    expect(written).toBe(1);
    expect(writtenUnder(memFs, STUB_OUT)).toEqual({
      [`${STUB_OUT}/.stub/agents/aidd-test-reviewer.md`]:
        "---\nname: 'reviewer'\n---\n\nReview the diff.\n",
    });
  });

  it("hands the agent to the layout's own transform when it declares one", async () => {
    const memFs = new InMemoryFileAdapter({ [`${STUB_PLUGIN_SRC}/agents/reviewer.md`]: reviewer });
    const contract = stubContract({
      artifacts: {
        ...stubContract().artifacts,
        agents: supportedArtifact((plugin, rel) => `.stub/agents/${plugin}-${rel.slice(7)}`, {
          transform: (content, plugin, base) => `${plugin}:${base}\n${content}`,
        }),
      },
    });
    await stubStrategy(memFs, contract).writeAgents("aidd-test", STUB_PLUGIN_SRC);
    expect(writtenUnder(memFs, STUB_OUT)).toEqual({
      [`${STUB_OUT}/.stub/agents/aidd-test-reviewer.md`]: `aidd-test:reviewer.md\n${reviewer}`,
    });
  });

  it("writes nothing for a layout hosting no agent", async () => {
    const memFs = new InMemoryFileAdapter({ [`${STUB_PLUGIN_SRC}/agents/reviewer.md`]: reviewer });
    const contract = stubContract({
      artifacts: { ...stubContract().artifacts, agents: { supported: false } },
    });
    expect(await stubStrategy(memFs, contract).writeAgents("aidd-test", STUB_PLUGIN_SRC)).toBe(0);
    expect(writtenUnder(memFs, STUB_OUT)).toEqual({});
  });

  it("names the agent that references the framework's tools directory", async () => {
    const memFs = new InMemoryFileAdapter({
      [`${STUB_PLUGIN_SRC}/agents/nested/reviewer.md`]: "See @{{TOOLS}}/x.md\n",
    });
    await expect(
      stubStrategy(memFs, stubContract()).writeAgents("aidd-test", STUB_PLUGIN_SRC)
    ).rejects.toThrow(
      new FrameworkPlaceholderInPluginError("aidd-test", "agents/nested/reviewer.md")
    );
  });
});

describe("the skills a flat layout writes", () => {
  const entry = "---\nname: hello\n---\n\nHello, see @./reference.json\n";
  const asset = '{ "see": "@./SKILL.md" }\n';

  function skillFs(): InMemoryFileAdapter {
    return new InMemoryFileAdapter({
      [`${STUB_PLUGIN_SRC}/skills/hello/SKILL.md`]: entry,
      [`${STUB_PLUGIN_SRC}/skills/hello/reference.json`]: asset,
    });
  }

  it("rewrites a skill markdown's own links and carries every other file as it is", async () => {
    const memFs = skillFs();
    expect(
      await stubStrategy(memFs, stubContract()).writeSkills("aidd-test", STUB_PLUGIN_SRC)
    ).toBe(2);
    expect(writtenUnder(memFs, STUB_OUT)).toEqual({
      [`${STUB_OUT}/.stub/skills/aidd-test/hello/SKILL.md`]:
        "---\nname: hello\n---\n\nHello, see [reference.json](./reference.json)\n",
      [`${STUB_OUT}/.stub/skills/aidd-test/hello/reference.json`]: asset,
    });
  });

  it("names the entry file after its own folder where the layout asks for it", async () => {
    const memFs = skillFs();
    const contract = stubContract({
      artifacts: {
        ...stubContract().artifacts,
        skills: supportedArtifact((plugin, rel) => `.stub/skills/${plugin}-${rel.slice(7)}`, {
          rewriteSkillName: true,
        }),
      },
    });
    await stubStrategy(memFs, contract).writeSkills("aidd-test", STUB_PLUGIN_SRC);
    expect(memFs.getFile(`${STUB_OUT}/.stub/skills/aidd-test-hello/SKILL.md`)).toBe(
      "---\nname: 'aidd-test-hello'\n---\n\nHello, see [reference.json](./reference.json)\n"
    );
  });

  it("leaves the entry file alone when its flat destination has no folder to name it after", async () => {
    const memFs = skillFs();
    const contract = stubContract({
      artifacts: {
        ...stubContract().artifacts,
        skills: supportedArtifact((_plugin, rel) => basename(rel), { rewriteSkillName: true }),
      },
    });
    await stubStrategy(memFs, contract).writeSkills("aidd-test", STUB_PLUGIN_SRC);
    expect(memFs.getFile(`${STUB_OUT}/SKILL.md`)).toBe(
      "---\nname: hello\n---\n\nHello, see [reference.json](./reference.json)\n"
    );
  });

  it("writes nothing for a layout hosting no skill", async () => {
    const memFs = skillFs();
    const contract = stubContract({
      artifacts: { ...stubContract().artifacts, skills: { supported: false } },
    });
    expect(await stubStrategy(memFs, contract).writeSkills("aidd-test", STUB_PLUGIN_SRC)).toBe(0);
    expect(writtenUnder(memFs, STUB_OUT)).toEqual({});
  });
});

describe("the hooks a flat layout writes", () => {
  const hooksJson = '{ "hooks": { "PreToolUse": [] } }';

  function hooksFs(): InMemoryFileAdapter {
    return new InMemoryFileAdapter({
      [`${STUB_PLUGIN_SRC}/hooks/hooks.json`]: hooksJson,
      [`${STUB_PLUGIN_SRC}/hooks/lib/check.sh`]: "#!/bin/sh\n",
    });
  }

  it("writes the manifest per plugin and every script beside it", async () => {
    const memFs = hooksFs();
    expect(await stubStrategy(memFs, stubContract()).writeHooks("aidd-test", STUB_PLUGIN_SRC)).toBe(
      2
    );
    expect(writtenUnder(memFs, STUB_OUT)).toEqual({
      [`${STUB_OUT}/.stub/hooks/aidd-test/aidd-test.hooks.json`]:
        '{\n  "hooks": {\n    "PreToolUse": []\n  }\n}\n',
      [`${STUB_OUT}/.stub/hooks/aidd-test/lib/check.sh`]: "#!/bin/sh\n",
    });
  });

  it("hands the rewritten manifest to the layout's own hooks transform", async () => {
    const memFs = hooksFs();
    const contract = stubContract({
      artifacts: {
        ...stubContract().artifacts,
        hooks: supportedArtifact((plugin, rel) => `.stub/hooks/${plugin}/${rel.slice(6)}`, {
          hooksTransform: (json) => `transformed:${json}`,
        }),
      },
    });
    await stubStrategy(memFs, contract).writeHooks("aidd-test", STUB_PLUGIN_SRC);
    expect(memFs.getFile(`${STUB_OUT}/.stub/hooks/aidd-test/aidd-test.hooks.json`)).toBe(
      'transformed:{\n  "hooks": {\n    "PreToolUse": []\n  }\n}\n'
    );
  });

  it("merges the manifest into the shared file the layout names, reporting what the merge said", async () => {
    const memFs = hooksFs();
    const logger = new CapturingLogger();
    const contract = stubContract({
      artifacts: {
        ...stubContract().artifacts,
        hooks: supportedArtifact((plugin, rel) => `.stub/hooks/${plugin}/${rel.slice(6)}`, {
          hooksMerge: (existing, incoming) => ({
            content: `${existing ?? "none"}+${incoming}`,
            warnings: ["one event has no equivalent"],
          }),
          hooksMergeDest: (outDir) => `${outDir}/.stub/settings.json`,
        }),
      },
    });
    await stubStrategy(memFs, contract, logger).writeHooks("aidd-test", STUB_PLUGIN_SRC);
    expect(memFs.getFile(`${STUB_OUT}/.stub/settings.json`)).toBe(
      'none+{"hooks":{"PreToolUse":[]}}'
    );
    expect(logger.warnMessages).toEqual(["one event has no equivalent"]);
  });

  it("generates the bridge a layout with no manifest of its own declares", async () => {
    const memFs = hooksFs();
    const contract = stubContract({
      artifacts: {
        ...stubContract().artifacts,
        hooks: supportedArtifact((plugin, rel) => `.stub/hooks/${plugin}/${rel.slice(6)}`, {
          skipHooksJson: true,
          hooksBridge: {
            generate: (raw, plugin) => `bridge(${plugin}):${raw}`,
            path: (plugin) => `.stub/plugin/${plugin}.js`,
            skipIfSourceHas: "own-plugin.js",
          },
        }),
      },
    });
    expect(await stubStrategy(memFs, contract).writeHooks("aidd-test", STUB_PLUGIN_SRC)).toBe(2);
    expect(writtenUnder(memFs, STUB_OUT)).toEqual({
      [`${STUB_OUT}/.stub/plugin/aidd-test.js`]: `bridge(aidd-test):${hooksJson}`,
      [`${STUB_OUT}/.stub/hooks/aidd-test/lib/check.sh`]: "#!/bin/sh\n",
    });
  });

  it("generates none where the bridge maps nothing the plugin declared", async () => {
    const memFs = hooksFs();
    const contract = stubContract({
      artifacts: {
        ...stubContract().artifacts,
        hooks: supportedArtifact((plugin, rel) => `.stub/hooks/${plugin}/${rel.slice(6)}`, {
          skipHooksJson: true,
          hooksBridge: {
            generate: () => null,
            path: (plugin) => `.stub/plugin/${plugin}.js`,
            skipIfSourceHas: "own-plugin.js",
          },
        }),
      },
    });
    expect(await stubStrategy(memFs, contract).writeHooks("aidd-test", STUB_PLUGIN_SRC)).toBe(1);
    expect(writtenUnder(memFs, STUB_OUT)).toEqual({
      [`${STUB_OUT}/.stub/hooks/aidd-test/lib/check.sh`]: "#!/bin/sh\n",
    });
  });

  it("generates no bridge for a plugin shipping its own", async () => {
    const memFs = hooksFs();
    memFs.setFile(`${STUB_PLUGIN_SRC}/hooks/own-plugin.js`, "export const plugin = () => {};\n");
    const contract = stubContract({
      artifacts: {
        ...stubContract().artifacts,
        hooks: supportedArtifact((plugin, rel) => `.stub/hooks/${plugin}/${rel.slice(6)}`, {
          skipHooksJson: true,
          hooksBridge: {
            generate: (raw, plugin) => `bridge(${plugin}):${raw}`,
            path: (plugin) => `.stub/plugin/${plugin}.js`,
            skipIfSourceHas: "own-plugin.js",
          },
        }),
      },
    });
    expect(await stubStrategy(memFs, contract).writeHooks("aidd-test", STUB_PLUGIN_SRC)).toBe(2);
    expect(memFs.has(`${STUB_OUT}/.stub/plugin/aidd-test.js`)).toBe(false);
  });

  it("writes nothing for a plugin shipping no hooks manifest", async () => {
    const memFs = new InMemoryFileAdapter({ [`${STUB_PLUGIN_SRC}/skills/hello/SKILL.md`]: "# H" });
    expect(await stubStrategy(memFs, stubContract()).writeHooks("aidd-test", STUB_PLUGIN_SRC)).toBe(
      0
    );
    expect(writtenUnder(memFs, STUB_OUT)).toEqual({});
  });

  it("says once that a layout hosting no hook skips the plugin's own", async () => {
    const memFs = hooksFs();
    const logger = new CapturingLogger();
    const contract = stubContract({
      artifacts: { ...stubContract().artifacts, hooks: { supported: false } },
    });
    expect(
      await stubStrategy(memFs, contract, logger).writeHooks("aidd-test", STUB_PLUGIN_SRC)
    ).toBe(0);
    expect(logger.warnMessages).toEqual([
      "Skipping hooks/ in plugin 'aidd-test' (hooks not supported for this target).",
    ]);
  });

  it("skips them silently where the build was given nobody to tell", async () => {
    const memFs = hooksFs();
    const contract = stubContract({
      artifacts: { ...stubContract().artifacts, hooks: { supported: false } },
    });
    expect(await stubStrategy(memFs, contract).writeHooks("aidd-test", STUB_PLUGIN_SRC)).toBe(0);
    expect(writtenUnder(memFs, STUB_OUT)).toEqual({});
  });
});

describe("what a flat layout writes once every plugin is built", () => {
  it("writes no per-plugin manifest", async () => {
    const memFs = new InMemoryFileAdapter({});
    expect(await stubStrategy(memFs, stubContract()).writePluginManifest()).toBe(0);
  });

  it("counts nothing where the layout emits no configuration of its own", async () => {
    const memFs = new InMemoryFileAdapter({});
    expect(
      await stubStrategy(memFs, stubContract()).postBuild({ name: "m", plugins: [] }, [], STUB_OUT)
    ).toBe(0);
  });

  it("hands every built plugin's name, the output and the source to the layout's own step", async () => {
    const memFs = new InMemoryFileAdapter({});
    const seen: { names: readonly string[]; outDir: string; sourceDir: string }[] = [];
    const contract = stubContract({
      emitConfigArtifact: (names, outDir, sourceDir) => {
        seen.push({ names, outDir, sourceDir });
        return Promise.resolve(1);
      },
    });
    const strategy = stubStrategy(memFs, contract);
    memFs.setFile(`${STUB_OUT}/.keep`, "");
    await strategy.preBuild(STUB_OUT, "/src");
    expect(
      await strategy.postBuild({ name: "m", plugins: [] }, [{ name: "aidd-test" }], STUB_OUT)
    ).toBe(1);
    expect(seen).toEqual([{ names: ["aidd-test"], outDir: STUB_OUT, sourceDir: "/src" }]);
  });
});

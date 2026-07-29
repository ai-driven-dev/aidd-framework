import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FrameworkBuildUseCase } from "../../../../src/application/use-cases/framework/framework-build-use-case.js";
import { FlatBuildStrategy } from "../../../../src/application/use-cases/framework/strategies/flat-build-strategy.js";
import { buildCodexFlatContract } from "../../../../src/application/use-cases/framework/strategies/tool-contracts.js";
import type { AssetProvider } from "../../../../src/domain/ports/asset-provider.js";
import type { JsonSchemaValidator } from "../../../../src/domain/ports/json-schema-validator.js";
import { AjvSchemaValidatorAdapter } from "../../../../src/infrastructure/adapters/ajv-schema-validator-adapter.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework");
const ABS_OUT = "/tmp/aidd-plugin-exclusion-test";
const EXCLUDED_PLUGIN = "aidd-test";
const KEPT_PLUGIN = "aidd-other";

const MINIMAL_SCHEMA = { type: "object" };

function makeValidator(): JsonSchemaValidator {
  return { validate: () => {} };
}

function makeAssetProvider(): AssetProvider {
  return {
    loadConfigAsset: () => {
      throw new Error("not used");
    },
    loadDefaultMarketplace: () => {
      throw new Error("not used");
    },
    loadSchema: () => MINIMAL_SCHEMA,
  };
}

function makeIsDirectory(fs: InMemoryFileAdapter): (path: string) => Promise<boolean> {
  return async (path: string): Promise<boolean> => {
    if (fs.has(path)) return false;
    const prefix = path.endsWith("/") ? path : `${path}/`;
    return fs.listAll().some((k) => k.startsWith(prefix));
  };
}

async function seedTwoPluginMarketplace(): Promise<InMemoryFileAdapter> {
  const memFs = new InMemoryFileAdapter();
  await seedFromDirectory(memFs, FIXTURE_DIR, { useAbsolutePaths: true });
  memFs.setFile(`${ABS_OUT}/.keep`, "");
  memFs.setFile(
    `${FIXTURE_DIR}/.claude-plugin/marketplace.json`,
    JSON.stringify({
      name: "aidd-framework",
      owner: { name: "Test" },
      plugins: [
        { name: EXCLUDED_PLUGIN, source: `./plugins/${EXCLUDED_PLUGIN}` },
        { name: KEPT_PLUGIN, source: `./plugins/${KEPT_PLUGIN}` },
      ],
    })
  );
  memFs.setFile(
    `${FIXTURE_DIR}/plugins/${KEPT_PLUGIN}/.claude-plugin/plugin.json`,
    JSON.stringify({ name: KEPT_PLUGIN, version: "0.1.0", description: "Kept plugin" })
  );
  memFs.setFile(
    `${FIXTURE_DIR}/plugins/${KEPT_PLUGIN}/agents/helper.md`,
    "---\nname: helper\ndescription: Helps.\n---\n\nBody.\n"
  );
  return memFs;
}

function makeUseCase(
  memFs: InMemoryFileAdapter,
  excludedPlugins?: readonly string[]
): FrameworkBuildUseCase {
  const ap = makeAssetProvider();
  const av = new AjvSchemaValidatorAdapter();
  const contract = { ...buildCodexFlatContract(), excludedPlugins };
  const strategy = new FlatBuildStrategy(
    memFs,
    av,
    ap,
    contract,
    false,
    ABS_OUT,
    makeIsDirectory(memFs),
    new CapturingLogger()
  );
  return new FrameworkBuildUseCase(memFs, makeValidator(), ap, new CapturingLogger(), strategy);
}

describe("Plugin exclusion mechanism", () => {
  let memFs: InMemoryFileAdapter;

  beforeEach(async () => {
    memFs = await seedTwoPluginMarketplace();
  });

  it("excludes the named plugin from the target's output while keeping the other", async () => {
    const useCase = makeUseCase(memFs, [EXCLUDED_PLUGIN]);
    await useCase.execute({
      sourceDir: FIXTURE_DIR,
      outDir: ABS_OUT,
      target: "codex",
      mode: "flat",
    });
    const excludedAgent = `${ABS_OUT}/.codex/agents/${EXCLUDED_PLUGIN}-code-reviewer.toml`;
    const keptAgent = `${ABS_OUT}/.codex/agents/${KEPT_PLUGIN}-helper.toml`;
    expect(memFs.has(excludedAgent)).toBe(false);
    expect(memFs.has(keptAgent)).toBe(true);
  });

  it("builds every plugin, including the one another target excludes, when no exclusion is set", async () => {
    const useCase = makeUseCase(memFs);
    await useCase.execute({
      sourceDir: FIXTURE_DIR,
      outDir: ABS_OUT,
      target: "codex",
      mode: "flat",
    });
    const excludedAgent = `${ABS_OUT}/.codex/agents/${EXCLUDED_PLUGIN}-code-reviewer.toml`;
    const keptAgent = `${ABS_OUT}/.codex/agents/${KEPT_PLUGIN}-helper.toml`;
    expect(memFs.has(excludedAgent)).toBe(true);
    expect(memFs.has(keptAgent)).toBe(true);
  });

  it("reports the skip on stderr rather than silently dropping the plugin", async () => {
    const logger = new CapturingLogger();
    const ap = makeAssetProvider();
    const contract = { ...buildCodexFlatContract(), excludedPlugins: [EXCLUDED_PLUGIN] };
    const strategy = new FlatBuildStrategy(
      memFs,
      new AjvSchemaValidatorAdapter(),
      ap,
      contract,
      false,
      ABS_OUT,
      makeIsDirectory(memFs),
      logger
    );
    const useCase = new FrameworkBuildUseCase(memFs, makeValidator(), ap, logger, strategy);
    await useCase.execute({
      sourceDir: FIXTURE_DIR,
      outDir: ABS_OUT,
      target: "codex",
      mode: "flat",
    });
    expect(logger.warnMessages.some((m) => m.includes(EXCLUDED_PLUGIN))).toBe(true);
  });

  it("the excluded plugin never appears in the returned plugin results", async () => {
    const useCase = makeUseCase(memFs, [EXCLUDED_PLUGIN]);
    const result = await useCase.execute({
      sourceDir: FIXTURE_DIR,
      outDir: ABS_OUT,
      target: "codex",
      mode: "flat",
    });
    expect(result.plugins.map((p) => p.name)).toEqual([KEPT_PLUGIN]);
  });
});

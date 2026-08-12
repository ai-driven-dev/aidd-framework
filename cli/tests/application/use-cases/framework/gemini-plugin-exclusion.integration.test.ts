import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FrameworkBuildUseCase } from "../../../../src/application/use-cases/framework/framework-build-use-case.js";
import { FlatBuildStrategy } from "../../../../src/application/use-cases/framework/strategies/flat-build-strategy.js";
import { buildGeminiFlatContract } from "../../../../src/application/use-cases/framework/strategies/tool-contracts.js";
import type { AssetProvider } from "../../../../src/domain/ports/asset-provider.js";
import type { JsonSchemaValidator } from "../../../../src/domain/ports/json-schema-validator.js";
import { AjvSchemaValidatorAdapter } from "../../../../src/infrastructure/adapters/ajv-schema-validator-adapter.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework");
const ABS_OUT = "/tmp/aidd-gemini-plugin-exclusion-test";
const EXISTING_PLUGIN = "aidd-test";
const ORCHESTRATOR_PLUGIN = "aidd-orchestrator";

function makeValidator(): JsonSchemaValidator {
  return { validate: () => {} };
}

function makeAssetProvider(): AssetProvider {
  return {
    loadConfigAsset: (_toolId, fileName) => {
      if (fileName === "settings.json") return { context: { fileName: ["AGENTS.md"] } };
      throw new Error("not used");
    },
    loadDefaultMarketplace: () => {
      throw new Error("not used");
    },
    loadSchema: () => ({ type: "object" }),
  };
}

function makeIsDirectory(fs: InMemoryFileAdapter): (path: string) => Promise<boolean> {
  return async (path: string): Promise<boolean> => {
    if (fs.has(path)) return false;
    const prefix = path.endsWith("/") ? path : `${path}/`;
    return fs.listAll().some((k) => k.startsWith(prefix));
  };
}

async function seedWithOrchestratorPlugin(): Promise<InMemoryFileAdapter> {
  const memFs = new InMemoryFileAdapter();
  await seedFromDirectory(memFs, FIXTURE_DIR, { useAbsolutePaths: true });
  memFs.setFile(`${ABS_OUT}/.keep`, "");
  memFs.setFile(
    `${FIXTURE_DIR}/.claude-plugin/marketplace.json`,
    JSON.stringify({
      name: "aidd-framework",
      owner: { name: "Test" },
      plugins: [
        { name: EXISTING_PLUGIN, source: `./plugins/${EXISTING_PLUGIN}` },
        { name: ORCHESTRATOR_PLUGIN, source: `./plugins/${ORCHESTRATOR_PLUGIN}` },
      ],
    })
  );
  memFs.setFile(
    `${FIXTURE_DIR}/plugins/${ORCHESTRATOR_PLUGIN}/.claude-plugin/plugin.json`,
    JSON.stringify({ name: ORCHESTRATOR_PLUGIN, version: "0.1.0", description: "Orchestrator" })
  );
  memFs.setFile(
    `${FIXTURE_DIR}/plugins/${ORCHESTRATOR_PLUGIN}/agents/dispatcher.md`,
    "---\nname: dispatcher\ndescription: Dispatches work.\n---\n\nBody.\n"
  );
  return memFs;
}

describe("Gemini's real flat contract excludes aidd-orchestrator", () => {
  let memFs: InMemoryFileAdapter;

  beforeEach(async () => {
    memFs = await seedWithOrchestratorPlugin();
  });

  it("builds aidd-test but not aidd-orchestrator", async () => {
    const ap = makeAssetProvider();
    const strategy = new FlatBuildStrategy(
      memFs,
      new AjvSchemaValidatorAdapter(),
      ap,
      buildGeminiFlatContract(),
      false,
      ABS_OUT,
      makeIsDirectory(memFs)
    );
    const useCase = new FrameworkBuildUseCase(
      memFs,
      makeValidator(),
      ap,
      new CapturingLogger(),
      strategy
    );
    const result = await useCase.execute({
      sourceDir: FIXTURE_DIR,
      outDir: ABS_OUT,
      target: "gemini",
      mode: "flat",
    });

    expect(result.plugins.map((p) => p.name)).toEqual([EXISTING_PLUGIN]);
    expect(memFs.has(`${ABS_OUT}/.gemini/agents/${ORCHESTRATOR_PLUGIN}-dispatcher.md`)).toBe(false);
    expect(memFs.has(`${ABS_OUT}/.gemini/agents/${EXISTING_PLUGIN}-code-reviewer.md`)).toBe(true);
  });

  it("reports the exclusion on stderr", async () => {
    const ap = makeAssetProvider();
    const logger = new CapturingLogger();
    const strategy = new FlatBuildStrategy(
      memFs,
      new AjvSchemaValidatorAdapter(),
      ap,
      buildGeminiFlatContract(),
      false,
      ABS_OUT,
      makeIsDirectory(memFs),
      logger
    );
    const useCase = new FrameworkBuildUseCase(memFs, makeValidator(), ap, logger, strategy);
    await useCase.execute({
      sourceDir: FIXTURE_DIR,
      outDir: ABS_OUT,
      target: "gemini",
      mode: "flat",
    });
    expect(logger.warnMessages.some((m) => m.includes(ORCHESTRATOR_PLUGIN))).toBe(true);
  });
});

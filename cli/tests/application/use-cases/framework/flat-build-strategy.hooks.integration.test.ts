/**
 * Integration tests for per-tool flat hook config registration.
 * Covers claude, cursor, codex hook output shapes and codex no-install-hook leak.
 * Spec §Per-tool contract, AC 1-5, 7.
 */
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FrameworkBuildUseCase } from "../../../../src/application/use-cases/framework/framework-build-use-case.js";
import { FlatBuildStrategy } from "../../../../src/application/use-cases/framework/strategies/flat-build-strategy.js";
import {
  buildClaudeFlatContract,
  buildCodexFlatContract,
  buildCopilotFlatContract,
  buildCursorFlatContract,
} from "../../../../src/application/use-cases/framework/strategies/tool-contracts.js";
import type { JsonSchemaValidator } from "../../../../src/domain/ports/json-schema-validator.js";
import { AjvSchemaValidatorAdapter } from "../../../../src/infrastructure/adapters/ajv-schema-validator-adapter.js";
import type { AssetProvider } from "../../../../src/kernel/ports/asset-provider.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework");
const ABS_OUT = "/tmp/aidd-flat-hooks-int-test";
const PLUGIN = "aidd-test";
// Avoid biome noTemplateCurlyInString
const CLAUDE_ROOT_VAR = "$" + "{CLAUDE_PLUGIN_ROOT}";

function makeValidator(): JsonSchemaValidator {
  return { validate(_schema: object, _data: unknown): void {} };
}

function makeAssetProvider(): AssetProvider {
  return {
    loadConfigAsset: () => {
      throw new Error("not used");
    },
    loadDefaultMarketplace: () => {
      throw new Error("not used");
    },
    loadSchema: () => ({}),
  };
}

function makeIsDirectory(fs: InMemoryFileAdapter): (path: string) => Promise<boolean> {
  return async (path: string): Promise<boolean> => {
    if (fs.has(path)) return false;
    const prefix = path.endsWith("/") ? path : `${path}/`;
    return fs.listAll().some((k) => k.startsWith(prefix));
  };
}

async function makeSeededFs(): Promise<InMemoryFileAdapter> {
  const memFs = new InMemoryFileAdapter();
  await seedFromDirectory(memFs, FIXTURE_DIR, { useAbsolutePaths: true });
  memFs.setFile(`${ABS_OUT}/.keep`, "");
  return memFs;
}

function makeStrategy(
  memFs: InMemoryFileAdapter,
  contractFn: () => ReturnType<typeof buildClaudeFlatContract>,
  logger = new CapturingLogger()
): FrameworkBuildUseCase {
  const strategy = new FlatBuildStrategy(
    memFs,
    new AjvSchemaValidatorAdapter(),
    makeAssetProvider(),
    contractFn(),
    false,
    ABS_OUT,
    makeIsDirectory(memFs),
    logger
  );
  return new FrameworkBuildUseCase(memFs, makeValidator(), makeAssetProvider(), logger, strategy);
}

// ── claude flat hooks ──────────────────────────────────────────────────────────

describe("claude flat hooks", () => {
  let memFs: InMemoryFileAdapter;

  beforeEach(async () => {
    memFs = await makeSeededFs();
  });

  it("merges hooks into .claude/settings.json (not standalone .hooks.json)", async () => {
    const useCase = makeStrategy(memFs, buildClaudeFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "claude" });

    const settingsPath = `${ABS_OUT}/.claude/settings.json`;
    expect(memFs.has(settingsPath)).toBe(true);

    const hooksJsonPath = `${ABS_OUT}/.claude/hooks/${PLUGIN}.hooks.json`;
    expect(memFs.has(hooksJsonPath)).toBe(false);
  });

  it("settings.json contains hooks key with PreToolUse from fixture", async () => {
    const useCase = makeStrategy(memFs, buildClaudeFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "claude" });

    const raw = memFs.getFile(`${ABS_OUT}/.claude/settings.json`) ?? "";
    const parsed = JSON.parse(raw) as { hooks?: Record<string, unknown[]> };
    expect(parsed.hooks?.PreToolUse).toBeDefined();
    expect(parsed.hooks?.PreToolUse).toHaveLength(1);
  });

  it("preserves existing settings keys when merging hooks", async () => {
    memFs.setFile(`${ABS_OUT}/.claude/settings.json`, JSON.stringify({ model: "claude-opus-4-5" }));
    const useCase = makeStrategy(memFs, buildClaudeFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "claude" });

    const raw = memFs.getFile(`${ABS_OUT}/.claude/settings.json`) ?? "";
    const parsed = JSON.parse(raw) as { model?: string; hooks?: unknown };
    expect(parsed.model).toBe("claude-opus-4-5");
    expect(parsed.hooks).toBeDefined();
  });

  it("copies hook scripts to .claude/hooks/<plugin>/", async () => {
    const useCase = makeStrategy(memFs, buildClaudeFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "claude" });

    const scriptPath = `${ABS_OUT}/.claude/hooks/${PLUGIN}/check.sh`;
    expect(memFs.has(scriptPath)).toBe(true);
  });

  it("settings.json has no unresolved CLAUDE_PLUGIN_ROOT", async () => {
    const useCase = makeStrategy(memFs, buildClaudeFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "claude" });

    const raw = memFs.getFile(`${ABS_OUT}/.claude/settings.json`) ?? "";
    expect(raw).not.toContain("CLAUDE_PLUGIN_ROOT");
    expect(raw).toContain(`./.claude/hooks/${PLUGIN}/check.sh`);
  });
});

// ── cursor flat hooks ──────────────────────────────────────────────────────────

describe("cursor flat hooks", () => {
  let memFs: InMemoryFileAdapter;

  beforeEach(async () => {
    memFs = await makeSeededFs();
  });

  it("writes single .cursor/hooks.json (not per-plugin .hooks.json)", async () => {
    const useCase = makeStrategy(memFs, buildCursorFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "cursor" });

    const singlePath = `${ABS_OUT}/.cursor/hooks.json`;
    expect(memFs.has(singlePath)).toBe(true);

    const perPluginPath = `${ABS_OUT}/.cursor/hooks/${PLUGIN}.hooks.json`;
    expect(memFs.has(perPluginPath)).toBe(false);
  });

  it("cursor hooks.json has version:1", async () => {
    const useCase = makeStrategy(memFs, buildCursorFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "cursor" });

    const raw = memFs.getFile(`${ABS_OUT}/.cursor/hooks.json`) ?? "";
    const parsed = JSON.parse(raw) as { version?: number };
    expect(parsed.version).toBe(1);
  });

  it("installs the common tool lifecycle event in Cursor's native name", async () => {
    const useCase = makeStrategy(memFs, buildCursorFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "cursor" });

    const raw = memFs.getFile(`${ABS_OUT}/.cursor/hooks.json`) ?? "";
    const parsed = JSON.parse(raw) as { hooks?: Record<string, unknown> };
    expect(Object.keys(parsed.hooks ?? {})).not.toContain("PreToolUse");
    expect(parsed.hooks?.preToolUse).toBeDefined();
  });

  it("warns for unsupported cursor events", async () => {
    memFs.setFile(
      `${FIXTURE_DIR}/plugins/${PLUGIN}/hooks/hooks.json`,
      JSON.stringify({
        hooks: {
          UnknownEvent: [{ hooks: [{ type: "command", command: "run.sh" }] }],
        },
      })
    );
    const logger = new CapturingLogger();
    const strategy = new FlatBuildStrategy(
      memFs,
      new AjvSchemaValidatorAdapter(),
      makeAssetProvider(),
      buildCursorFlatContract(),
      false,
      ABS_OUT,
      makeIsDirectory(memFs),
      logger
    );
    const useCase = new FrameworkBuildUseCase(
      memFs,
      makeValidator(),
      makeAssetProvider(),
      logger,
      strategy
    );
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "cursor" });
    expect(logger.warnMessages.some((w) => w.includes("UnknownEvent"))).toBe(true);
  });

  it("copies hook scripts to .cursor/hooks/<plugin>/", async () => {
    const useCase = makeStrategy(memFs, buildCursorFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "cursor" });

    const scriptPath = `${ABS_OUT}/.cursor/hooks/${PLUGIN}/check.sh`;
    expect(memFs.has(scriptPath)).toBe(true);
  });

  it("cursor hooks.json has no unresolved CLAUDE_PLUGIN_ROOT", async () => {
    // Override fixture with a SessionStart event for a real end-to-end path check
    memFs.setFile(
      `${FIXTURE_DIR}/plugins/${PLUGIN}/hooks/hooks.json`,
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [{ type: "command", command: `node ${CLAUDE_ROOT_VAR}/hooks/run.js` }],
            },
          ],
        },
      })
    );
    const useCase = makeStrategy(memFs, buildCursorFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "cursor" });

    const raw = memFs.getFile(`${ABS_OUT}/.cursor/hooks.json`) ?? "";
    expect(raw).not.toContain("CLAUDE_PLUGIN_ROOT");
    expect(raw).toContain(`./.cursor/hooks/${PLUGIN}/run.js`);
  });
});

// ── copilot flat hooks (shape) ─────────────────────────────────────────────────

describe("copilot flat hooks shape", () => {
  let memFs: InMemoryFileAdapter;

  beforeEach(async () => {
    memFs = await makeSeededFs();
  });

  it("copilot hooks file has flat shape (no nested hooks[] matcher-group)", async () => {
    const useCase = makeStrategy(memFs, buildCopilotFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "copilot" });

    const raw = memFs.getFile(`${ABS_OUT}/.github/hooks/${PLUGIN}.hooks.json`) ?? "";
    const parsed = JSON.parse(raw) as {
      version?: number;
      hooks?: Record<string, Array<Record<string, unknown>>>;
    };
    expect(parsed.version).toBe(1);
    const entries = parsed.hooks?.PreToolUse ?? [];
    // Each entry must be {type, command} directly — no nested {hooks:[...]} wrapper
    for (const entry of entries) {
      expect(entry).not.toHaveProperty("hooks");
      expect(entry).toHaveProperty("type");
      expect(entry).toHaveProperty("command");
    }
  });
});

// ── codex flat hooks ───────────────────────────────────────────────────────────

describe("codex flat hooks (no install-hook leak)", () => {
  let memFs: InMemoryFileAdapter;

  beforeEach(async () => {
    memFs = await makeSeededFs();
  });

  it("codex .codex/hooks.json has top-level hooks wrapper", async () => {
    const useCase = makeStrategy(memFs, buildCodexFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "codex" });

    const raw = memFs.getFile(`${ABS_OUT}/.codex/hooks.json`) ?? "";
    const parsed = JSON.parse(raw) as { hooks?: unknown };
    expect(parsed).toHaveProperty("hooks");
  });

  it("codex hooks.json does NOT contain install-mode .aidd/scripts/update_memory.cjs", async () => {
    const useCase = makeStrategy(memFs, buildCodexFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "codex" });

    const raw = memFs.getFile(`${ABS_OUT}/.codex/hooks.json`) ?? "";
    expect(raw).not.toContain("update_memory.cjs");
    expect(raw).not.toContain(".aidd/scripts");
  });

  it("codex hooks.json contains framework plugin hook commands (no install-mode leak)", async () => {
    const useCase = makeStrategy(memFs, buildCodexFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "codex" });

    const raw = memFs.getFile(`${ABS_OUT}/.codex/hooks.json`) ?? "";
    expect(raw).toContain(`./.codex/hooks/${PLUGIN}/check.sh`);
    expect(raw).not.toContain("CLAUDE_PLUGIN_ROOT");
  });

  it("copies hook scripts to .codex/hooks/<plugin>/", async () => {
    const useCase = makeStrategy(memFs, buildCodexFlatContract);
    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir: ABS_OUT, target: "codex" });

    const scriptPath = `${ABS_OUT}/.codex/hooks/${PLUGIN}/check.sh`;
    expect(memFs.has(scriptPath)).toBe(true);
  });
});

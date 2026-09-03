import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FlatTargetExistsError } from "../../src/domain/errors.js";
import { BundledAssetProviderAdapter } from "../../src/infrastructure/assets/asset-loader.js";
import {
  createFrameworkBuildUseCase,
  type FrameworkBuildDeps,
} from "../../src/infrastructure/deps.js";
import { CapturingLogger } from "../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../helpers/ports/in-memory-file-adapter.js";
import { seedFromDirectory } from "../helpers/ports/seed-from-directory.js";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework");
// Canonical flat destination for the fixture's "aidd-test" plugin agent, under --target copilot.
const COLLIDING_RELATIVE_PATH = ".github/agents/aidd-test-code-reviewer.agent.md";
const STALE_CONTENT = "stale content from a previous build";

function makeDeps(fs: InMemoryFileAdapter): FrameworkBuildDeps {
  return {
    fs,
    assetProvider: new BundledAssetProviderAdapter(),
    logger: new CapturingLogger(),
  };
}

describe("createFrameworkBuildUseCase threads the caller's --force through to the flat build strategy", () => {
  let outDir: string;
  let fs: InMemoryFileAdapter;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), "aidd-force-wiring-"));
    fs = new InMemoryFileAdapter();
    await seedFromDirectory(fs, FIXTURE_DIR, { useAbsolutePaths: true });
    // outDir must exist for both the in-memory fs (fileExists) and the real disk
    // (FlatBuildStrategy's isDirectory guard is backed by a real fs.stat call).
    fs.setFile(`${outDir}/.keep`, "");
    fs.setFile(`${outDir}/${COLLIDING_RELATIVE_PATH}`, STALE_CONTENT);
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("force: false throws FlatTargetExistsError when the canonical destination already exists", async () => {
    const useCase = createFrameworkBuildUseCase(makeDeps(fs), {
      target: "copilot",
      mode: "flat",
      outDir,
      force: false,
    });
    if (useCase === undefined) throw new Error("copilot:flat must be wired in the registry");

    await expect(
      useCase.execute({ sourceDir: FIXTURE_DIR, outDir, target: "copilot" })
    ).rejects.toBeInstanceOf(FlatTargetExistsError);
    expect(fs.getFile(`${outDir}/${COLLIDING_RELATIVE_PATH}`)).toBe(STALE_CONTENT);
  });

  it("force: true overwrites the canonical destination instead of throwing", async () => {
    const useCase = createFrameworkBuildUseCase(makeDeps(fs), {
      target: "copilot",
      mode: "flat",
      outDir,
      force: true,
    });
    if (useCase === undefined) throw new Error("copilot:flat must be wired in the registry");

    await useCase.execute({ sourceDir: FIXTURE_DIR, outDir, target: "copilot" });

    const written = fs.getFile(`${outDir}/${COLLIDING_RELATIVE_PATH}`);
    expect(written).not.toBe(STALE_CONTENT);
    expect(written).toContain("aidd-test-code-reviewer");
  });
});

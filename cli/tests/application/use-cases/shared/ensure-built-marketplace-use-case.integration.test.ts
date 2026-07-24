import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FrameworkBuildUseCase } from "../../../../src/application/use-cases/framework/framework-build-use-case.js";
import { FlatBuildStrategy } from "../../../../src/application/use-cases/framework/strategies/flat-build-strategy.js";
import { buildCopilotFlatContract } from "../../../../src/application/use-cases/framework/strategies/tool-contracts.js";
import {
  EnsureBuiltMarketplaceUseCase,
  type FrameworkBuildFor,
} from "../../../../src/application/use-cases/shared/ensure-built-marketplace-use-case.js";
import type {
  ResolveMarketplaceOptions,
  ResolveMarketplaceUseCase,
} from "../../../../src/application/use-cases/shared/resolve-marketplace-use-case.js";
import { Marketplace } from "../../../../src/domain/models/marketplace.js";
import { builtMarketplaceDir } from "../../../../src/domain/models/paths.js";
import type { AssetProvider } from "../../../../src/domain/ports/asset-provider.js";
import type { JsonSchemaValidator } from "../../../../src/domain/ports/json-schema-validator.js";
import type { VersionReader } from "../../../../src/domain/ports/version-reader.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const PROJECT = "/proj";
const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework");
const PLUGIN = "aidd-test";

const MINIMAL_MANIFEST_SCHEMA = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string" } },
};

function noopValidator(): JsonSchemaValidator {
  return { validate: () => undefined };
}

function stubAssetProvider(): AssetProvider {
  return {
    loadConfigAsset: () => {
      throw new Error("not used");
    },
    loadDefaultMarketplace: () => {
      throw new Error("not used");
    },
    loadSchema: (name) => (name === "plugin-manifest" ? MINIMAL_MANIFEST_SCHEMA : {}),
  };
}

function makeIsDirectory(memFs: InMemoryFileAdapter): (path: string) => Promise<boolean> {
  return async (path: string): Promise<boolean> => {
    if (memFs.has(path)) return false;
    const prefix = path.endsWith("/") ? path : `${path}/`;
    return memFs.listAll().some((k) => k.startsWith(prefix));
  };
}

function makeMarketplace(): Marketplace {
  return Marketplace.create({
    name: "aidd-framework",
    source: { kind: "local", path: "/src/framework" },
    scope: "project",
    addedAt: "2026-06-29T00:00:00.000Z",
  });
}

function fakeResolve(localPath: string, version: string | undefined): ResolveMarketplaceUseCase {
  return {
    execute: async ({ marketplace }: ResolveMarketplaceOptions) => ({
      marketplace,
      localPath,
      catalog: version === undefined ? null : { version, plugins: [] },
    }),
  } as unknown as ResolveMarketplaceUseCase;
}

function fakeVersion(value: string): VersionReader {
  return { get: () => value };
}

describe("builtMarketplaceDir", () => {
  it("places the per-target tree under .aidd/cache/built/<mkt>/<target>", () => {
    expect(builtMarketplaceDir("/p", "aidd", "codex")).toBe("/p/.aidd/cache/built/aidd/codex");
  });
});

describe("EnsureBuiltMarketplaceUseCase", () => {
  let fs: InMemoryFileAdapter;
  let builds: number;
  let buildFor: FrameworkBuildFor;

  beforeEach(() => {
    fs = new InMemoryFileAdapter();
    builds = 0;
    buildFor = (_target, _mode, outDir) =>
      ({
        execute: async () => {
          builds += 1;
          await fs.writeFile(join(outDir, "plugins/aidd-vcs/SKILL.md"), "built content");
          return { outDir, plugins: [], totalFiles: 1 };
        },
      }) as unknown as FrameworkBuildUseCase;
  });

  it("rebuilds and writes a sentinel when none exists", async () => {
    const uc = new EnsureBuiltMarketplaceUseCase(
      fs,
      fakeResolve("/src/framework", "1.0.0"),
      buildFor,
      fakeVersion("5.0.0")
    );
    const r = await uc.execute({
      projectRoot: PROJECT,
      marketplace: makeMarketplace(),
      target: "codex",
      mode: "marketplace",
    });
    expect(r.rebuilt).toBe(true);
    expect(builds).toBe(1);
    expect(fs.getFile(join(r.builtDir, ".build-version"))).toBe("5.0.0:1.0.0");
  });

  it("does not rebuild when the sentinel matches (cliVer:catalogVer)", async () => {
    const builtDir = builtMarketplaceDir(PROJECT, "aidd-framework", "codex");
    fs.setFile(join(builtDir, ".build-version"), "5.0.0:1.0.0");
    const uc = new EnsureBuiltMarketplaceUseCase(
      fs,
      fakeResolve("/src/framework", "1.0.0"),
      buildFor,
      fakeVersion("5.0.0")
    );
    const r = await uc.execute({
      projectRoot: PROJECT,
      marketplace: makeMarketplace(),
      target: "codex",
      mode: "marketplace",
    });
    expect(r.rebuilt).toBe(false);
    expect(builds).toBe(0);
  });

  it("rebuilds when the CLI version changed even if catalog version is the same", async () => {
    const builtDir = builtMarketplaceDir(PROJECT, "aidd-framework", "codex");
    fs.setFile(join(builtDir, ".build-version"), "4.0.0:1.0.0");
    const uc = new EnsureBuiltMarketplaceUseCase(
      fs,
      fakeResolve("/src/framework", "1.0.0"),
      buildFor,
      fakeVersion("5.0.0")
    );
    const r = await uc.execute({
      projectRoot: PROJECT,
      marketplace: makeMarketplace(),
      target: "codex",
      mode: "marketplace",
    });
    expect(r.rebuilt).toBe(true);
    expect(builds).toBe(1);
  });

  it("always rebuilds when catalog version is undefined", async () => {
    const builtDir = builtMarketplaceDir(PROJECT, "aidd-framework", "codex");
    fs.setFile(join(builtDir, ".build-version"), "5.0.0:unversioned");
    const uc = new EnsureBuiltMarketplaceUseCase(
      fs,
      fakeResolve("/src/framework", undefined),
      buildFor,
      fakeVersion("5.0.0")
    );
    const r = await uc.execute({
      projectRoot: PROJECT,
      marketplace: makeMarketplace(),
      target: "codex",
      mode: "marketplace",
    });
    expect(r.rebuilt).toBe(true);
    expect(builds).toBe(1);
  });

  it("builds via a temp dir and copies into the cache when the cache nests under the source (dogfood)", async () => {
    // Source == project root, so builtDir (.aidd/cache/built/...) nests under source → guardPaths would throw.
    const uc = new EnsureBuiltMarketplaceUseCase(
      fs,
      fakeResolve(PROJECT, "1.0.0"),
      buildFor,
      fakeVersion("5.0.0")
    );
    const r = await uc.execute({
      projectRoot: PROJECT,
      marketplace: makeMarketplace(),
      target: "codex",
      mode: "marketplace",
    });
    expect(r.builtDir).toBe(builtMarketplaceDir(PROJECT, "aidd-framework", "codex"));
    expect(fs.getFile(join(r.builtDir, "plugins/aidd-vcs/SKILL.md"))).toBe("built content");
    // temp dir cleaned up
    expect(fs.listUnder(tmpdir()).length).toBe(0);
  });

  it("memoizes within a run: a second call for the same target/version does not rebuild", async () => {
    const uc = new EnsureBuiltMarketplaceUseCase(
      fs,
      fakeResolve("/src/framework", "1.0.0"),
      buildFor,
      fakeVersion("5.0.0")
    );
    const opts = {
      projectRoot: PROJECT,
      marketplace: makeMarketplace(),
      target: "codex" as const,
      mode: "marketplace" as const,
    };
    await uc.execute(opts);
    await uc.execute(opts);
    expect(builds).toBe(1);
  });
});

// BUG-E2-01: deps.ts hardcodes force:true for this rebuild path because outDir is always
// builtMarketplaceDir() — an aidd-owned disposable cache, never a user-owned directory. A
// collision here only means "the cache from a previous build already exists" and should be
// overwritten, not treated as a destructive overwrite of user data. This pins that decision
// with a real FlatBuildStrategy (not the fake buildFor stub used above), so it fails if
// force is ever flipped to false here, or if outDir stops being cache-only.
describe("force behavior at the cache-rebuild path (BUG-E2-01)", () => {
  it("overwrites a colliding file already present in the build cache instead of throwing FlatTargetExistsError", async () => {
    const memFs = new InMemoryFileAdapter();
    await seedFromDirectory(memFs, FIXTURE_DIR, { useAbsolutePaths: true });

    const builtDir = builtMarketplaceDir(PROJECT, "aidd-framework", "copilot");
    const agentPath = `${builtDir}/.github/agents/${PLUGIN}-code-reviewer.agent.md`;
    memFs.setFile(agentPath, "stale cache content from a previous build");

    const realBuildFor: FrameworkBuildFor = (_target, _mode, outDir) => {
      const validator = noopValidator();
      const assetProvider = stubAssetProvider();
      const strategy = new FlatBuildStrategy(
        memFs,
        validator,
        assetProvider,
        buildCopilotFlatContract(),
        true, // force:true — mirrors deps.ts wiring for every *:flat target
        outDir,
        makeIsDirectory(memFs),
        new CapturingLogger()
      );
      return new FrameworkBuildUseCase(
        memFs,
        validator,
        assetProvider,
        new CapturingLogger(),
        strategy
      );
    };

    const uc = new EnsureBuiltMarketplaceUseCase(
      memFs,
      fakeResolve(FIXTURE_DIR, "1.0.0"),
      realBuildFor,
      fakeVersion("5.0.0")
    );

    const result = await uc.execute({
      projectRoot: PROJECT,
      marketplace: makeMarketplace(),
      target: "copilot",
      mode: "flat",
    });

    expect(result.rebuilt).toBe(true);
    expect(memFs.getFile(agentPath)).not.toBe("stale cache content from a previous build");
  });
});

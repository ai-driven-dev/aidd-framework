import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FrameworkBuildUseCase } from "../../../../src/application/use-cases/framework/framework-build-use-case.js";
import { FlatBuildStrategy } from "../../../../src/application/use-cases/framework/strategies/flat-build-strategy.js";
import { buildCopilotFlatContract } from "../../../../src/application/use-cases/framework/strategies/tool-contracts.js";
import {
  EnsureBuiltMarketplaceUseCase,
  type FrameworkBuildFor,
} from "../../../../src/application/use-cases/shared/ensure-built-marketplace-use-case.js";
import { FetchMarketplaceSourceUseCase } from "../../../../src/application/use-cases/shared/fetch-marketplace-source-use-case.js";
import { ResolveMarketplaceUseCase } from "../../../../src/application/use-cases/shared/resolve-marketplace-use-case.js";
import { Marketplace } from "../../../../src/domain/models/marketplace.js";
import { BUILT_CACHE_SUBDIR, builtMarketplaceDir } from "../../../../src/domain/models/paths.js";
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
    // memFs stores every key "/"-normalised (in-memory-file-adapter.ts's own `norm`) - a
    // native, backslash-separated `path` on Windows would never prefix-match one of those
    // keys without the same normalisation here.
    const normalized = path.replaceAll("\\", "/");
    const prefix = normalized.endsWith("/") ? normalized : `${normalized}/`;
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
  return new ResolveMarketplaceUseCase(
    new FetchMarketplaceSourceUseCase({ fetch: async () => localPath }),
    {
      load: async () => (version === undefined ? null : { version, plugins: [] }),
      loadForeign: async () => [],
    }
  );
}

function fakeVersion(value: string): VersionReader {
  return { get: () => value };
}

describe("builtMarketplaceDir", () => {
  it("places the per-target tree under .aidd/cache/built/<mkt>/<target>", () => {
    expect(builtMarketplaceDir("/p", "aidd", "codex")).toBe(
      // The layout stays spelled out segment by segment, not taken from the same
      // constant the implementation uses - that would only assert the code agrees with
      // itself. join() so the claim is about the layout, not the separator (#707).
      join("/p", ".aidd", "cache", "built", "aidd", "codex")
    );
  });
});

describe("EnsureBuiltMarketplaceUseCase", () => {
  let fs: InMemoryFileAdapter;
  let builds: number;
  let buildFor: FrameworkBuildFor;

  beforeEach(() => {
    fs = new InMemoryFileAdapter();
    builds = 0;
    buildFor = (_target, _mode, outDir) => ({
      execute: async () => {
        builds += 1;
        await fs.writeFile(join(outDir, "plugins/aidd-vcs/SKILL.md"), "built content");
        return { outDir, plugins: [], totalFiles: 1 };
      },
    });
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
    const builtDir = resolve(builtMarketplaceDir(PROJECT, "aidd-framework", "codex"));
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
    const builtDir = resolve(builtMarketplaceDir(PROJECT, "aidd-framework", "codex"));
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
    const builtDir = resolve(builtMarketplaceDir(PROJECT, "aidd-framework", "codex"));
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
    expect(r.builtDir).toBe(resolve(builtMarketplaceDir(PROJECT, "aidd-framework", "codex")));
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

// outDir here is always builtMarketplaceDir() — an aidd-owned disposable cache, never a
// user directory — so a collision just means "a previous build is still there" and must be
// overwritten. Uses a real FlatBuildStrategy rather than the fake buildFor stub above, so it
// fails if force is flipped to false or outDir stops being cache-only.
describe("force behavior at the cache-rebuild path", () => {
  it("overwrites a colliding file already present in the build cache instead of throwing FlatTargetExistsError", async () => {
    const memFs = new InMemoryFileAdapter();
    await seedFromDirectory(memFs, FIXTURE_DIR, { useAbsolutePaths: true });

    // EnsureBuiltMarketplaceUseCase.execute() resolves builtDir before handing it to
    // buildFor(), so FlatBuildStrategy's write target (absOut) is always drive-qualified on
    // Windows - mirror that resolve() here so this test's drive-less PROJECT seeds the same
    // path the real write lands on.
    const builtDir = resolve(builtMarketplaceDir(PROJECT, "aidd-framework", "copilot"));
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

// The "force behavior" suite above proves the collision-bypass fires. It does not prove
// the bypass only ever fires against an aidd-owned directory — that guarantee lives in
// which outDir runBuild() is called with, both for a direct build (build()) and a build
// routed through a temp dir first (buildViaTemp(), used when the cache nests under the
// source). This pins that outDir, whichever path is taken, never leaves the build cache
// or the OS temp dir — so a future change that points either call site at a live user
// directory (e.g. a tool's real config dir) fails here, not in someone's project.
describe("outDir invariant for the cache-rebuild build path", () => {
  it("only ever builds into the aidd build cache or the OS temp dir, never a user directory", async () => {
    const memFs = new InMemoryFileAdapter();
    const capturedOutDirs: string[] = [];
    const capturingBuildFor: FrameworkBuildFor = (_target, _mode, outDir) => {
      capturedOutDirs.push(outDir);
      return {
        execute: async () => {
          await memFs.writeFile(join(outDir, "plugins/aidd-vcs/SKILL.md"), "built content");
          return { outDir, plugins: [], totalFiles: 1 };
        },
      };
    };

    // Direct path: source lives outside the cache tree → build() writes straight to builtDir.
    const direct = new EnsureBuiltMarketplaceUseCase(
      memFs,
      fakeResolve("/src/framework", "1.0.0"),
      capturingBuildFor,
      fakeVersion("5.0.0")
    );
    await direct.execute({
      projectRoot: PROJECT,
      marketplace: makeMarketplace(),
      target: "codex",
      mode: "marketplace",
    });

    // Dogfood path: source is the project root, so builtDir nests under it → buildViaTemp()
    // routes the same call through a temp dir instead (see the "builds via a temp dir" test above).
    const dogfood = new EnsureBuiltMarketplaceUseCase(
      memFs,
      fakeResolve(PROJECT, "1.0.0"),
      capturingBuildFor,
      fakeVersion("5.0.0")
    );
    await dogfood.execute({
      projectRoot: PROJECT,
      marketplace: makeMarketplace(),
      target: "cursor",
      mode: "marketplace",
    });

    expect(capturedOutDirs).toHaveLength(2);
    // resolve(): execute() always resolves builtDir before this capture sees it (#707).
    const cacheRoot = resolve(join(PROJECT, BUILT_CACHE_SUBDIR));
    const tmpRoot = tmpdir();
    for (const outDir of capturedOutDirs) {
      const underCache = outDir === cacheRoot || outDir.startsWith(`${cacheRoot}${sep}`);
      const underTmp = outDir === tmpRoot || outDir.startsWith(`${tmpRoot}${sep}`);
      expect(underCache || underTmp).toBe(true);
    }
    // The dogfood call specifically must have gone through the temp dir, not the cache
    // (#707): nested() now compares "/"-normalized paths, and both sourceDir and builtDir
    // are resolve()'d before it sees them, so a drive-less-vs-drive-qualified or
    // "\"-vs-"/" mismatch can no longer hide real nesting on Windows.
    expect(capturedOutDirs[1]?.startsWith(`${tmpRoot}${sep}`)).toBe(true);
  });
});

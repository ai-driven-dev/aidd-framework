import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  EnsureBuiltMarketplaceUseCase,
  type FrameworkBuildFor,
} from "../../../../src/application/use-cases/shared/ensure-built-marketplace-use-case.js";
import type {
  ResolveMarketplaceOptions,
  ResolveMarketplaceUseCase,
} from "../../../../src/application/use-cases/shared/resolve-marketplace-use-case.js";
import type { JsonSchemaValidator } from "../../../../src/contexts/tools/domain/ports/schema-validator.js";
import { buildCopilotFlatContract } from "../../../../src/contexts/tools/domain/profiles/copilot/build.js";
import { FlatBuildStrategy } from "../../../../src/contexts/translate/application/strategies/flat-build-strategy.js";
import { FrameworkBuildUseCase } from "../../../../src/contexts/translate/application/translate-source.js";
import { Marketplace } from "../../../../src/domain/models/marketplace.js";
import type { VersionReader } from "../../../../src/domain/ports/version-reader.js";
import { BUILT_CACHE_SUBDIR, builtMarketplaceDir } from "../../../../src/kernel/paths.js";
import type { AssetProvider } from "../../../../src/kernel/ports/asset-provider.js";
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

/** A published source: its version changes when its content does, so it can be believed. */
function makeRemoteMarketplace(): Marketplace {
  return Marketplace.create({
    name: "aidd-framework",
    source: { kind: "github", repo: "ai-driven-dev/framework" },
    scope: "project",
    addedAt: "2026-06-29T00:00:00.000Z",
  });
}

function makeUserMarketplace(): Marketplace {
  return Marketplace.create({
    name: "shared-mkt",
    source: { kind: "local", path: "/src/framework" },
    scope: "user",
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
      fakeVersion("5.0.0"),
      () => "/user-cache"
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

  it("does not rebuild a published source when the sentinel matches (cliVer:catalogVer)", async () => {
    const builtDir = builtMarketplaceDir(PROJECT, "aidd-framework", "codex");
    fs.setFile(join(builtDir, ".build-version"), "5.0.0:1.0.0");
    const uc = new EnsureBuiltMarketplaceUseCase(
      fs,
      fakeResolve("/src/framework", "1.0.0"),
      buildFor,
      fakeVersion("5.0.0"),
      () => "/user-cache"
    );
    const r = await uc.execute({
      projectRoot: PROJECT,
      marketplace: makeRemoteMarketplace(),
      target: "codex",
      mode: "marketplace",
    });
    expect(r.rebuilt).toBe(false);
    expect(builds).toBe(0);
  });

  // A directory on this machine can change without its version moving — which is all of
  // framework development — so the version says nothing about freshness there.
  it("rebuilds a local source even when the sentinel matches", async () => {
    const builtDir = builtMarketplaceDir(PROJECT, "aidd-framework", "codex");
    fs.setFile(join(builtDir, ".build-version"), "5.0.0:1.0.0");
    const uc = new EnsureBuiltMarketplaceUseCase(
      fs,
      fakeResolve("/src/framework", "1.0.0"),
      buildFor,
      fakeVersion("5.0.0"),
      () => "/user-cache"
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

  // An explicit refresh asks for the source to be re-read; answering from cache would
  // answer a different question.
  it("rebuilds a published source when a refresh was asked for", async () => {
    const builtDir = builtMarketplaceDir(PROJECT, "aidd-framework", "codex");
    fs.setFile(join(builtDir, ".build-version"), "5.0.0:1.0.0");
    const uc = new EnsureBuiltMarketplaceUseCase(
      fs,
      fakeResolve("/src/framework", "1.0.0"),
      buildFor,
      fakeVersion("5.0.0"),
      () => "/user-cache"
    );
    const r = await uc.execute({
      projectRoot: PROJECT,
      marketplace: makeRemoteMarketplace(),
      target: "codex",
      mode: "marketplace",
      forceRefresh: true,
    });
    expect(r.rebuilt).toBe(true);
  });

  it("rebuilds when the CLI version changed even if catalog version is the same", async () => {
    const builtDir = builtMarketplaceDir(PROJECT, "aidd-framework", "codex");
    fs.setFile(join(builtDir, ".build-version"), "4.0.0:1.0.0");
    const uc = new EnsureBuiltMarketplaceUseCase(
      fs,
      fakeResolve("/src/framework", "1.0.0"),
      buildFor,
      fakeVersion("5.0.0"),
      () => "/user-cache"
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
      fakeVersion("5.0.0"),
      () => "/user-cache"
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
      fakeVersion("5.0.0"),
      () => "/user-cache"
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
      fakeVersion("5.0.0"),
      () => "/user-cache"
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
      fakeVersion("5.0.0"),
      () => "/user-cache"
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
      } as unknown as FrameworkBuildUseCase;
    };

    // Direct path: source lives outside the cache tree → build() writes straight to builtDir.
    const direct = new EnsureBuiltMarketplaceUseCase(
      memFs,
      fakeResolve("/src/framework", "1.0.0"),
      capturingBuildFor,
      fakeVersion("5.0.0"),
      () => "/user-cache"
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
      fakeVersion("5.0.0"),
      () => "/user-cache"
    );
    await dogfood.execute({
      projectRoot: PROJECT,
      marketplace: makeMarketplace(),
      target: "cursor",
      mode: "marketplace",
    });

    expect(capturedOutDirs).toHaveLength(2);
    const cacheRoot = join(PROJECT, BUILT_CACHE_SUBDIR);
    const tmpRoot = tmpdir();
    for (const outDir of capturedOutDirs) {
      const underCache = outDir === cacheRoot || outDir.startsWith(`${cacheRoot}/`);
      const underTmp = outDir === tmpRoot || outDir.startsWith(`${tmpRoot}/`);
      expect(underCache || underTmp).toBe(true);
    }
    // The dogfood call specifically must have gone through the temp dir, not the cache.
    expect(capturedOutDirs[1]?.startsWith(`${tmpRoot}/`)).toBe(true);
  });

  // A user-scope marketplace is declared once for every project, so building it inside
  // whichever project happened to register it would tie that declaration to the life of
  // one of them: delete that project and the registration points at nothing.
  it("builds a user-scope marketplace outside the project", async () => {
    const memFs = new InMemoryFileAdapter();
    const built: string[] = [];
    const capturing: FrameworkBuildFor = (_t, _m, outDir) =>
      ({
        execute: async () => {
          built.push(outDir);
          await memFs.writeFile(join(outDir, ".claude-plugin/marketplace.json"), "{}");
          return { outDir, plugins: [], totalFiles: 1 };
        },
      }) as unknown as FrameworkBuildUseCase;

    const uc = new EnsureBuiltMarketplaceUseCase(
      memFs,
      fakeResolve("/src/framework", "1.0.0"),
      capturing,
      fakeVersion("5.0.0"),
      () => "/user-cache"
    );
    const result = await uc.execute({
      projectRoot: PROJECT,
      marketplace: makeUserMarketplace(),
      target: "claude",
      mode: "marketplace",
    });

    expect(result.builtDir.startsWith("/user-cache")).toBe(true);
    expect(result.builtDir.startsWith(PROJECT)).toBe(false);
  });
});

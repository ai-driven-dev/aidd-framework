// Called from use-cases/marketplace and use-cases/plugin.
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  builtMarketplaceDir,
  pathsOverlap,
  userBuiltMarketplaceDir,
} from "../../../../kernel/paths.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { VersionReader } from "../../../../kernel/ports/version-reader.js";
import type { ResolveMarketplace } from "../../../distribution/application/resolve-marketplace-use-case.js";
import type { Marketplace } from "../../../distribution/domain/marketplace.js";
import type { FrameworkBuildMode } from "../../../tools/domain/registry.js";
import type { FrameworkBuild } from "../../../translate/application/translate-source.js";
import type { FrameworkBuildTarget } from "../../../translate/domain/build-target.js";

/** Builds a framework build for a target/mode writing to outDir, or undefined when unsupported. */
export type FrameworkBuildFor = (
  target: FrameworkBuildTarget,
  mode: FrameworkBuildMode,
  outDir: string
) => FrameworkBuild | undefined;

export interface EnsureBuiltMarketplaceOptions {
  readonly projectRoot: string;
  readonly marketplace: Marketplace;
  readonly target: FrameworkBuildTarget;
  readonly mode: FrameworkBuildMode;
  readonly forceRefresh?: boolean;
}

export interface EnsureBuiltMarketplaceResult {
  readonly builtDir: string;
  readonly version: string | undefined;
  readonly rebuilt: boolean;
}

const SENTINEL_FILE = ".build-version";
const UNVERSIONED = "unversioned";

/**
 * Guarantees a per-target built tree exists in cache for a marketplace, so install
 * consumers read the SAME transformed content `framework build` produces. Build is
 * the single source of truth; this owns source resolution, staleness, and the
 * guard-safe outDir (build to temp then copy when the cache nests under the source).
 */
/** Getting a built tree for a target, as its callers need it. */
export interface EnsureBuiltMarketplace {
  execute(options: EnsureBuiltMarketplaceOptions): Promise<EnsureBuiltMarketplaceResult>;
}

export class EnsureBuiltMarketplaceUseCase implements EnsureBuiltMarketplace {
  private readonly memo = new Map<string, EnsureBuiltMarketplaceResult>();

  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly resolveMarketplace: ResolveMarketplace,
    private readonly buildFor: FrameworkBuildFor,
    private readonly version: VersionReader,
    /**
     * Where a user-scope marketplace's built tree belongs. Building it under the
     * project that happened to register it would tie a declaration meant for every
     * project to the life of one of them: delete that project and the global
     * registration points at nothing.
     */
    private readonly userCacheRoot: () => string
  ) {}

  async execute(options: EnsureBuiltMarketplaceOptions): Promise<EnsureBuiltMarketplaceResult> {
    // resolve(), matching sourceDir below: builtMarketplaceDir() joins with the platform
    // separator, and on Windows a drive-less projectRoot yields a drive-less builtDir here
    // while FrameworkBuildUseCase.execute() resolves its own outDir copy for validation only
    // — leaving FlatBuildStrategy's write target (captured unresolved at construction) to
    // diverge from the path that gets checked. Both scopes need it, not just the project one.
    const builtDir = resolve(
      options.marketplace.scope === "user"
        ? userBuiltMarketplaceDir(this.userCacheRoot(), options.marketplace.name, options.target)
        : builtMarketplaceDir(options.projectRoot, options.marketplace.name, options.target)
    );
    const resolved = await this.resolveMarketplace.execute({
      marketplace: options.marketplace,
      projectRoot: options.projectRoot,
      forceRefresh: options.forceRefresh,
    });
    const sentinel = this.sentinelValue(resolved.catalog?.version);
    const memoKey = `${options.marketplace.name}:${options.target}:${sentinel}`;
    const memoized = this.memo.get(memoKey);
    if (memoized !== undefined) return memoized;
    const result = await this.ensure(
      options,
      builtDir,
      resolve(resolved.localPath),
      sentinel,
      this.versionIsTrustworthy(options)
    );
    this.memo.set(memoKey, result);
    return result;
  }

  private sentinelValue(catalogVersion: string | undefined): string {
    return `${this.version.get()}:${catalogVersion ?? UNVERSIONED}`;
  }

  /**
   * Whether the catalog version can be believed when it says nothing changed.
   *
   * For a published source it can: a different content carries a different version.
   * For a directory on this machine it cannot — someone edits a file and the version
   * stays put, which is the whole of framework development. And an explicit refresh
   * asks for the source to be re-read, so believing a cached answer would answer a
   * different question than the one asked.
   *
   * Rebuilding costs about two tenths of a second for the real framework, 434 files,
   * so the safe answer is also the cheap one.
   */
  private versionIsTrustworthy(options: EnsureBuiltMarketplaceOptions): boolean {
    if (options.forceRefresh === true) return false;
    return options.marketplace.source.kind !== "local";
  }

  private async ensure(
    options: EnsureBuiltMarketplaceOptions,
    builtDir: string,
    sourceDir: string,
    sentinel: string,
    versionIsTrustworthy: boolean
  ): Promise<EnsureBuiltMarketplaceResult> {
    const version = sentinel.split(":")[1];
    if (versionIsTrustworthy && (await this.isFresh(builtDir, sentinel))) {
      return { builtDir, version, rebuilt: false };
    }
    await this.build(options.target, options.mode, sourceDir, builtDir);
    await this.fs.writeFile(join(builtDir, SENTINEL_FILE), sentinel);
    return { builtDir, version, rebuilt: true };
  }

  private async isFresh(builtDir: string, sentinel: string): Promise<boolean> {
    if (sentinel.endsWith(`:${UNVERSIONED}`)) return false;
    const path = join(builtDir, SENTINEL_FILE);
    if (!(await this.fs.fileExists(path))) return false;
    const current = await this.fs.readFile(path).catch(() => "");
    return current === sentinel;
  }

  private async build(
    target: FrameworkBuildTarget,
    mode: FrameworkBuildMode,
    sourceDir: string,
    builtDir: string
  ): Promise<void> {
    if (this.nested(sourceDir, builtDir)) {
      await this.buildViaTemp(target, mode, sourceDir, builtDir);
      return;
    }
    await this.runBuild(target, mode, sourceDir, builtDir);
  }

  private nested(sourceDir: string, builtDir: string): boolean {
    return pathsOverlap(sourceDir, builtDir);
  }

  private async buildViaTemp(
    target: FrameworkBuildTarget,
    mode: FrameworkBuildMode,
    sourceDir: string,
    builtDir: string
  ): Promise<void> {
    const temp = join(tmpdir(), `aidd-built-${target}-${mode}`);
    await this.fs.deleteDirectory(temp);
    await this.runBuild(target, mode, sourceDir, temp);
    await this.fs.deleteDirectory(builtDir);
    await this.copyDir(temp, builtDir);
    await this.fs.deleteDirectory(temp);
  }

  // Every outDir reaching this method (see build() and buildViaTemp() above) is either
  // builtMarketplaceDir() or a temp dir this class just deleteDirectory'd — an aidd-owned
  // cache, never a user directory — so a collision here is stale-cache reuse, not data loss.
  private async runBuild(
    target: FrameworkBuildTarget,
    mode: FrameworkBuildMode,
    sourceDir: string,
    outDir: string
  ): Promise<void> {
    await this.fs.createDirectory(outDir);
    const build = this.buildFor(target, mode, outDir);
    if (build === undefined) {
      throw new Error(`No framework build for target '${target}' mode '${mode}'.`);
    }
    await build.execute({ sourceDir, outDir, target, mode });
  }

  private async copyDir(from: string, to: string): Promise<void> {
    const files = await this.fs.listFilesRecursive(from);
    for (const abs of files) {
      const rel = abs.slice(from.length + 1);
      const content = await this.fs.readFile(abs);
      await this.fs.writeFile(join(to, rel), content);
    }
  }
}

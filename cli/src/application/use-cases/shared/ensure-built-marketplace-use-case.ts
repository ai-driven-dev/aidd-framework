import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
  FrameworkBuildMode,
  FrameworkBuildTarget,
} from "../../../domain/models/framework-build.js";
import type { Marketplace } from "../../../domain/models/marketplace.js";
import { builtMarketplaceDir, pathsOverlap } from "../../../domain/models/paths.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { VersionReader } from "../../../domain/ports/version-reader.js";
import type { FrameworkBuildUseCase } from "../framework/framework-build-use-case.js";
import type { ResolveMarketplaceUseCase } from "./resolve-marketplace-use-case.js";

/** Builds a FrameworkBuildUseCase for a target/mode writing to outDir, or undefined when unsupported. */
export type FrameworkBuildFor = (
  target: FrameworkBuildTarget,
  mode: FrameworkBuildMode,
  outDir: string
) => FrameworkBuildUseCase | undefined;

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
export class EnsureBuiltMarketplaceUseCase {
  private readonly memo = new Map<string, EnsureBuiltMarketplaceResult>();

  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly resolveMarketplace: ResolveMarketplaceUseCase,
    private readonly buildFor: FrameworkBuildFor,
    private readonly version: VersionReader
  ) {}

  async execute(options: EnsureBuiltMarketplaceOptions): Promise<EnsureBuiltMarketplaceResult> {
    // resolve(), matching sourceDir below: builtMarketplaceDir() joins with the platform
    // separator, and on Windows a drive-less projectRoot yields a drive-less builtDir here
    // while FrameworkBuildUseCase.execute() resolves its own outDir copy for validation only
    // - leaving FlatBuildStrategy's write target (captured unresolved at construction) to
    // diverge from the path that gets checked.
    const builtDir = resolve(
      builtMarketplaceDir(options.projectRoot, options.marketplace.name, options.target)
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
    const result = await this.ensure(options, builtDir, resolve(resolved.localPath), sentinel);
    this.memo.set(memoKey, result);
    return result;
  }

  private sentinelValue(catalogVersion: string | undefined): string {
    return `${this.version.get()}:${catalogVersion ?? UNVERSIONED}`;
  }

  private async ensure(
    options: EnsureBuiltMarketplaceOptions,
    builtDir: string,
    sourceDir: string,
    sentinel: string
  ): Promise<EnsureBuiltMarketplaceResult> {
    const version = sentinel.split(":")[1];
    if (await this.isFresh(builtDir, sentinel)) {
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

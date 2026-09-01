import { homedir } from "node:os";
import { join } from "node:path";
import { compareSemver, isSemver } from "../../domain/models/semver.js";
import type { SelfUpdater } from "../../domain/ports/self-updater.js";
import type { VersionReader } from "../../domain/ports/version-reader.js";
import type { FileReader } from "../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../kernel/ports/file-writer.js";
import type { Logger } from "../../kernel/ports/logger.js";

interface CachedCheck {
  checkedAt: number;
  latest: string;
}

function isOutdated(version: string, latest: string): boolean {
  return isSemver(version) && compareSemver(version, latest) < 0;
}

function resolveCachePath(): string {
  const dir = process.env.AIDD_USER_CONFIG_DIR ?? join(homedir(), ".config", "aidd");
  return join(dir, "update-check.json");
}

export class CheckUpdateUseCase {
  constructor(
    private readonly cliUpdater: SelfUpdater,
    private readonly versionReader: VersionReader,
    private readonly logger: Logger,
    private readonly fs: FileReader & FileWriter
  ) {}

  /** Hot path: print the update notice from cached value only — fresh OR stale, never network. */
  async printFromCacheOnly(): Promise<void> {
    const cached = await this.readCacheRaw();
    if (cached === null) return;
    const current = this.versionReader.get();
    if (!isOutdated(current, cached.latest)) return;
    this.logger.warn(
      `CLI update available: v${current.replace(/^v/, "")} → v${cached.latest.replace(/^v/, "")}`
    );
    this.logger.warn("Run `aidd self-update`.");
  }

  /** Online piggyback path: fetch the latest release and persist the cache. Awaited. */
  async refresh(): Promise<void> {
    const { version: latest } = await this.cliUpdater.fetchLatestRelease();
    await this.writeCache(latest);
  }

  private async readCacheRaw(): Promise<CachedCheck | null> {
    const path = resolveCachePath();
    if (!(await this.fs.fileExists(path))) return null;
    try {
      const raw = await this.fs.readFile(path);
      return JSON.parse(raw) as CachedCheck;
    } catch {
      return null;
    }
  }

  private async writeCache(latest: string): Promise<void> {
    const path = resolveCachePath();
    await this.fs.createDirectory(join(path, ".."));
    await this.fs.writeFile(path, JSON.stringify({ checkedAt: Date.now(), latest }));
  }
}

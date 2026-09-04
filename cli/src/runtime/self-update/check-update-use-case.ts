import { homedir } from "node:os";
import { join } from "node:path";
import type { FileReader } from "../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../kernel/ports/file-writer.js";
import type { Logger } from "../../kernel/ports/logger.js";
import type { VersionReader } from "../../kernel/ports/version-reader.js";
import { compareSemver, isSemver } from "../../kernel/semver.js";
import type { SelfUpdater } from "./self-updater.js";

interface CachedCheck {
  checkedAt: number;
  latest: string;
}

function isOutdated(version: string, latest: string): boolean {
  return isSemver(version) && compareSemver(version, latest) < 0;
}

function resolveConfigDir(): string {
  return process.env.AIDD_USER_CONFIG_DIR ?? join(homedir(), ".config", "aidd");
}

/** Where this cache is written: under `cache/`, beside every other disposable thing, rather
 * than loose among the files a person chose. Nothing here is a choice — it is the last
 * version seen and when, refetched whenever it is missing. */
function resolveCachePath(): string {
  return join(resolveConfigDir(), "cache", "update-check.json");
}

/** Where it used to be written, read when the current path holds nothing. A cache that
 * appeared to be missing would cost one needless network call on the next online command —
 * harmless, and still worth not doing to every existing install at once. Never written to,
 * so the old file simply stops being touched and can be deleted by hand. */
function legacyCachePath(): string {
  return join(resolveConfigDir(), "update-check.json");
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
    this.logger.warn("Run `aidd update`.");
  }

  /** Online piggyback path: fetch the latest release and persist the cache. Awaited. */
  async refresh(): Promise<void> {
    const { version: latest } = await this.cliUpdater.fetchLatestRelease();
    await this.writeCache(latest);
  }

  private async readCacheRaw(): Promise<CachedCheck | null> {
    return (await this.readCacheAt(resolveCachePath())) ?? this.readCacheAt(legacyCachePath());
  }

  private async readCacheAt(path: string): Promise<CachedCheck | null> {
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

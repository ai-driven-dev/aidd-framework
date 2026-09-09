import { join } from "node:path";
import type { FileReader } from "../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../kernel/ports/file-writer.js";
import type { Logger } from "../../kernel/ports/logger.js";
import type { VersionReader } from "../../kernel/ports/version-reader.js";
import { compareSemver, isSemver } from "../../kernel/semver.js";
import { userConfigDir } from "../user-config-dir.js";
import type { SelfUpdater } from "./self-updater.js";

interface CachedCheck {
  checkedAt: number;
  latest: string;
}

function isOutdated(version: string, latest: string): boolean {
  return isSemver(version) && compareSemver(version, latest) < 0;
}

/** Under `cache/`, beside every other disposable thing: nothing here is a choice a person
 * made. The resolution is `userConfigDir()`'s, so the file a machine-scope `clean` purges is
 * the file this writes, whatever the machine's own configuration says. */
function resolveCachePath(): string {
  return join(userConfigDir(), "cache", "update-check.json");
}

/** Read when the current path holds nothing, never written to, so an existing install is not
 * made to refetch. */
function legacyCachePath(): string {
  return join(userConfigDir(), "update-check.json");
}

export class CheckUpdateUseCase {
  constructor(
    private readonly cliUpdater: SelfUpdater,
    private readonly versionReader: VersionReader,
    private readonly logger: Logger,
    private readonly fs: FileReader & FileWriter
  ) {}

  /** Hot path: the cached value only, fresh or stale, never the network. */
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

import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CheckUpdateUseCase } from "../../src/application/use-cases/check-update-use-case.js";
import { FileHash } from "../../src/domain/models/file.js";
import type { FileReader } from "../../src/domain/ports/file-reader.js";
import type { FileWriter } from "../../src/domain/ports/file-writer.js";
import type { Logger } from "../../src/domain/ports/logger.js";
import type { SelfUpdater } from "../../src/domain/ports/self-updater.js";
import type { VersionReader } from "../../src/domain/ports/version-reader.js";

const CACHE_PATH_SUFFIX = "update-check.json";

function makeLogger(): { logger: Logger; logs: string[] } {
  const logs: string[] = [];
  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: (m: string) => logs.push(m),
  };
  return { logger, logs };
}

function makeSelfUpdater(latestVersion: string): SelfUpdater {
  return {
    fetchLatestRelease: vi.fn().mockResolvedValue({ version: latestVersion, changelog: "" }),
    install: vi.fn().mockReturnValue("/usr/local/bin/aidd"),
  };
}

function makeVersionReader(version: string): VersionReader {
  return { get: () => version };
}

function makeFsStub(store: Map<string, string> = new Map()): FileReader & FileWriter {
  return {
    readFile: async (path: string) => {
      const content = store.get(path);
      if (content === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return content;
    },
    fileExists: async (path: string) => store.has(path),
    listDirectory: async () => [],
    readFileHash: async () => new FileHash("a".repeat(32)),
    listFilesRecursive: async () => [],
    writeFile: async (path: string, content: string) => {
      store.set(path, content);
    },
    deleteFile: async (path: string) => {
      store.delete(path);
    },
    createDirectory: async () => {},
    deleteEmptyDirectories: async () => {},
    deleteDirectory: async () => {},
    chmodExecutable: async () => {},
    fileMode: async () => 0o644,
  };
}

function seedCache(
  store: Map<string, string>,
  latest: string,
  ageMs = 0,
  configDir?: string
): void {
  const dir = configDir ?? process.env.AIDD_USER_CONFIG_DIR ?? join(homedir(), ".config", "aidd");
  const path = join(dir, CACHE_PATH_SUFFIX);
  store.set(path, JSON.stringify({ checkedAt: Date.now() - ageMs, latest }));
}

describe("CheckUpdateUseCase", () => {
  describe("printFromCacheOnly", () => {
    it("warns when CLI is outdated and cache present", async () => {
      const { logger, logs } = makeLogger();
      const store = new Map<string, string>();
      seedCache(store, "v2.0.0");
      await new CheckUpdateUseCase(
        makeSelfUpdater("v2.0.0"),
        makeVersionReader("1.0.0"),
        logger,
        makeFsStub(store)
      ).printFromCacheOnly();
      expect(logs.some((l) => l.includes("CLI update available"))).toBe(true);
      expect(logs.some((l) => l.includes("aidd self-update"))).toBe(true);
    });

    it("stays silent when CLI version matches latest in cache", async () => {
      const { logger, logs } = makeLogger();
      const store = new Map<string, string>();
      seedCache(store, "1.0.0");
      await new CheckUpdateUseCase(
        makeSelfUpdater("1.0.0"),
        makeVersionReader("1.0.0"),
        logger,
        makeFsStub(store)
      ).printFromCacheOnly();
      expect(logs).toHaveLength(0);
    });

    it("stays silent when cache is absent (no network call)", async () => {
      const { logger, logs } = makeLogger();
      const selfUpdater = makeSelfUpdater("v2.0.0");
      await new CheckUpdateUseCase(
        selfUpdater,
        makeVersionReader("1.0.0"),
        logger,
        makeFsStub()
      ).printFromCacheOnly();
      expect(logs).toHaveLength(0);
      expect(vi.mocked(selfUpdater.fetchLatestRelease)).not.toHaveBeenCalled();
    });

    it("warns from stale cache (fresh OR stale — notice always shows)", async () => {
      const { logger, logs } = makeLogger();
      const store = new Map<string, string>();
      const STALE_MS = 25 * 60 * 60 * 1000; // 25h — past 24h TTL
      seedCache(store, "v2.0.0", STALE_MS);
      await new CheckUpdateUseCase(
        makeSelfUpdater("v2.0.0"),
        makeVersionReader("1.0.0"),
        logger,
        makeFsStub(store)
      ).printFromCacheOnly();
      expect(logs.some((l) => l.includes("CLI update available"))).toBe(true);
    });
  });

  describe("refresh (online piggyback)", () => {
    it("fetches and persists the cache", async () => {
      const { logger } = makeLogger();
      const store = new Map<string, string>();
      const selfUpdater = makeSelfUpdater("v2.0.0");
      await new CheckUpdateUseCase(
        selfUpdater,
        makeVersionReader("1.0.0"),
        logger,
        makeFsStub(store)
      ).refresh();
      expect(vi.mocked(selfUpdater.fetchLatestRelease)).toHaveBeenCalledTimes(1);
      const written = [...store.values()].find((v) => v.includes("latest"));
      expect(written).toBeDefined();
      expect(JSON.parse(written as string).latest).toBe("v2.0.0");
    });
  });
});

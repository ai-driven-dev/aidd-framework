import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FileHash } from "../../../src/kernel/file.js";
import type { FileReader } from "../../../src/kernel/ports/file-reader.js";
import type { FileWriter } from "../../../src/kernel/ports/file-writer.js";
import type { Logger } from "../../../src/kernel/ports/logger.js";
import type { VersionReader } from "../../../src/kernel/ports/version-reader.js";
import { CheckUpdateUseCase } from "../../../src/runtime/self-update/check-update-use-case.js";
import type { SelfUpdater } from "../../../src/runtime/self-update/self-updater.js";

const TTL_24H = 24 * 60 * 60 * 1000;

function makeLogger(): { logger: Logger; warns: string[]; debugs: string[] } {
  const warns: string[] = [];
  const debugs: string[] = [];
  const logger: Logger = {
    debug: (m: string) => debugs.push(m),
    info: () => {},
    warn: (m: string) => warns.push(m),
  };
  return { logger, warns, debugs };
}

function makeSelfUpdater(latest: string): SelfUpdater {
  return {
    fetchLatestRelease: vi.fn().mockResolvedValue({ version: latest, changelog: "" }),
    install: vi.fn().mockReturnValue("/usr/local/bin/aidd"),
  };
}

function makeVersionReader(version: string): VersionReader {
  return { get: () => version };
}

function makeFsStub(store: Map<string, string> = new Map()): FileReader & FileWriter {
  return {
    readFile: async (path: string) => {
      const v = store.get(path);
      if (v === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return v;
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
    isExecutable: async () => false,
    chmodExecutable: async () => {},
  };
}

function seedCache(store: Map<string, string>, latest: string, ageMs = 0): void {
  const dir = process.env.AIDD_USER_CONFIG_DIR ?? join(homedir(), ".config", "aidd");
  store.set(
    join(dir, "update-check.json"),
    JSON.stringify({ checkedAt: Date.now() - ageMs, latest })
  );
}

// ---- SWR matrix ----

describe("SWR matrix: printFromCacheOnly", () => {
  it("fresh cache (<24h) → shows notice, no network call", async () => {
    const { logger, warns } = makeLogger();
    const store = new Map<string, string>();
    seedCache(store, "2.0.0", 0);
    const selfUpdater = makeSelfUpdater("2.0.0");
    await new CheckUpdateUseCase(
      selfUpdater,
      makeVersionReader("1.0.0"),
      logger,
      makeFsStub(store)
    ).printFromCacheOnly();
    expect(warns.some((w) => w.includes("CLI update available"))).toBe(true);
    expect(selfUpdater.fetchLatestRelease).not.toHaveBeenCalled();
  });

  it("stale cache (>24h) → still shows notice from stale value, no network call", async () => {
    const { logger, warns } = makeLogger();
    const store = new Map<string, string>();
    seedCache(store, "2.0.0", TTL_24H + 1000); // stale by 1 s
    const selfUpdater = makeSelfUpdater("99.0.0"); // network would return something different
    await new CheckUpdateUseCase(
      selfUpdater,
      makeVersionReader("1.0.0"),
      logger,
      makeFsStub(store)
    ).printFromCacheOnly();
    expect(warns.some((w) => w.includes("CLI update available"))).toBe(true);
    expect(selfUpdater.fetchLatestRelease).not.toHaveBeenCalled();
  });

  it("absent cache → no notice, no network call", async () => {
    const { logger, warns } = makeLogger();
    const selfUpdater = makeSelfUpdater("2.0.0");
    await new CheckUpdateUseCase(
      selfUpdater,
      makeVersionReader("1.0.0"),
      logger,
      makeFsStub()
    ).printFromCacheOnly();
    expect(warns).toHaveLength(0);
    expect(selfUpdater.fetchLatestRelease).not.toHaveBeenCalled();
  });

  it("hot path never awaits network: resolves even if fetchLatestRelease never settles", async () => {
    const { logger } = makeLogger();
    const store = new Map<string, string>();
    seedCache(store, "2.0.0", 0);
    const neverResolves: SelfUpdater = {
      fetchLatestRelease: vi.fn().mockReturnValue(new Promise<never>(() => {})),
      install: vi.fn().mockReturnValue("/usr/local/bin/aidd"),
    };
    await expect(
      new CheckUpdateUseCase(
        neverResolves,
        makeVersionReader("1.0.0"),
        logger,
        makeFsStub(store)
      ).printFromCacheOnly()
    ).resolves.toBeUndefined();
    expect(neverResolves.fetchLatestRelease).not.toHaveBeenCalled();
  });
});

describe("refresh (online piggyback path)", () => {
  it("fetches the latest release and persists the cache", async () => {
    const { logger } = makeLogger();
    const store = new Map<string, string>();
    const selfUpdater = makeSelfUpdater("2.0.0");
    await new CheckUpdateUseCase(
      selfUpdater,
      makeVersionReader("1.0.0"),
      logger,
      makeFsStub(store)
    ).refresh();
    expect(selfUpdater.fetchLatestRelease).toHaveBeenCalledTimes(1);
    const written = [...store.values()].find((v) => v.includes('"latest"'));
    expect(written).toBeDefined();
    expect(JSON.parse(written as string).latest).toBe("2.0.0");
  });
});

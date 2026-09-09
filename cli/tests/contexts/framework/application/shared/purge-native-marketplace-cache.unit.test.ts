import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  purgeAllNativeCaches,
  purgeNativeMarketplaceCache,
  type UndoneToolRegistrations,
} from "../../../../../src/contexts/framework/application/shared/purge-native-marketplace-cache.js";
import type { ToolId } from "../../../../../src/kernel/tool.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { FakeHostMarketplaceRegistryReader } from "../../../../helpers/ports/fake-host-marketplace-registry-reader.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const HOME = "/home/u";
const CACHE_ROOT = "/cache";
const HOST_NAME = "aidd-framework";
const CANDIDATE = join(CACHE_ROOT, HOST_NAME);

function undone(binary: string): UndoneToolRegistrations {
  return {
    registrations: {
      binary,
      marketplaces: [{ alias: HOST_NAME, hostName: HOST_NAME }],
      pluginRefs: [],
    },
    removedHostNames: new Set([HOST_NAME]),
  };
}

describe("purgeAllNativeCaches", () => {
  it("skips a tool whose profile declares no plugin cache", async () => {
    const fs = new InMemoryFileAdapter({ [join(HOME, ".cursor", "plugins", "a.json")]: "{}" });
    const logger = new CapturingLogger();

    await purgeAllNativeCaches(
      fs,
      logger,
      HOME,
      new Map(),
      new Map<ToolId, UndoneToolRegistrations>([["cursor", undone("cursor")]])
    );

    expect(logger.allMessages).toStrictEqual([]);
    expect(fs.listAll()).toStrictEqual([join(HOME, ".cursor", "plugins", "a.json")]);
  });
});

describe("purgeNativeMarketplaceCache", () => {
  it("names the cache path when its real location escapes the cache root", async () => {
    const fs = new InMemoryFileAdapter();
    fs.setSymlink(CANDIDATE, "/elsewhere");
    const logger = new CapturingLogger();

    await purgeNativeMarketplaceCache(fs, logger, undefined, CACHE_ROOT, "codex", HOST_NAME, true);

    expect(logger.warnMessages).toStrictEqual([
      `codex: cache path for '${HOST_NAME}' does not resolve inside ${CACHE_ROOT}; left in place: ${CANDIDATE}`,
    ]);
  });

  it("keeps and names a cache the host never confirmed removing, for a host without a registry", async () => {
    const logger = new CapturingLogger();

    await purgeNativeMarketplaceCache(
      new InMemoryFileAdapter(),
      logger,
      undefined,
      CACHE_ROOT,
      "codex",
      HOST_NAME,
      false
    );

    expect(logger.warnMessages).toStrictEqual([
      `codex: cache for '${HOST_NAME}' left in place, its own removal was not confirmed: ${CANDIDATE}`,
    ]);
  });

  it("purges the cache and says so once the host's registry is gone", async () => {
    const fs = new InMemoryFileAdapter({ [join(CANDIDATE, "plugin.json")]: "{}" });
    const logger = new CapturingLogger();
    const reader = new FakeHostMarketplaceRegistryReader({
      location: "/home/u/.claude/plugins/known_marketplaces.json",
      absent: true,
    });

    await purgeNativeMarketplaceCache(fs, logger, reader, CACHE_ROOT, "claude", HOST_NAME, true);

    expect(fs.listAll()).toStrictEqual([]);
    expect(logger.infoMessages).toStrictEqual([
      `claude: cache for '${HOST_NAME}' purged: ${CANDIDATE}`,
    ]);
  });
});

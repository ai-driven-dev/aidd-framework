import { describe, expect, it } from "vitest";
import {
  hostMarketplaceSourceConflict,
  isDriftFound,
} from "../../../../../src/contexts/framework/application/shared/host-marketplace-source-conflict.js";
import { userBuiltMarketplaceDir } from "../../../../../src/kernel/paths.js";
import { FakeHostMarketplaceRegistryReader } from "../../../../helpers/ports/fake-host-marketplace-registry-reader.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const NAME = "aidd-framework";
const LOCATION = "/home/.claude/plugins/known_marketplaces.json";

/**
 * `userConfigDir()` can sit behind a symlink the OS resolves on its own (macOS's `/var` →
 * `/private/var`), so an unresolved `userCacheRoot` never matches the realpath'd sources.
 */
describe("hostMarketplaceSourceConflict — resolving every path through the same realpath", () => {
  it("still decides a version-behind drift when userCacheRoot is reached through a symlink", async () => {
    const fs = new InMemoryFileAdapter();
    fs.setSymlink("/var-home", "/private/var-home");
    const rawUserCacheRoot = "/var-home/.config/aidd";
    const resolvedUserCacheRoot = "/private/var-home/.config/aidd";
    const requestedSource = userBuiltMarketplaceDir(resolvedUserCacheRoot, "1.0.0", NAME, "claude");
    const registeredSource = userBuiltMarketplaceDir(
      resolvedUserCacheRoot,
      "2.0.0",
      NAME,
      "claude"
    );
    const reader = new FakeHostMarketplaceRegistryReader({
      location: LOCATION,
      entries: new Map([[NAME, registeredSource]]),
    });

    const check = await hostMarketplaceSourceConflict(
      fs,
      "claude",
      reader,
      requestedSource,
      { name: NAME, pluginNames: [] },
      {
        userCacheRoot: rawUserCacheRoot,
        projectRoot: "/project",
        marketplaceName: NAME,
        target: "claude",
      }
    );

    expect(isDriftFound(check)).toBe(true);
    expect(check && isDriftFound(check) ? check.drift : undefined).toEqual({
      kind: "version-behind",
      registeredVersion: "2.0.0",
      requestedVersion: "1.0.0",
    });
  });
});

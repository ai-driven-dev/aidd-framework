import { describe, expect, it } from "vitest";
import { marketplaceSourceDrift } from "../../../../src/contexts/framework/domain/marketplace-source-drift.js";
import { userBuiltMarketplaceDir } from "../../../../src/kernel/paths.js";

const DRIFT_CONTEXT = {
  userCacheRoot: "/user-cache",
  projectRoot: "/project",
  marketplaceName: "aidd-framework",
  target: "claude",
};

function sharedPath(version: string): string {
  return userBuiltMarketplaceDir(
    DRIFT_CONTEXT.userCacheRoot,
    version,
    DRIFT_CONTEXT.marketplaceName,
    DRIFT_CONTEXT.target
  );
}

describe("marketplaceSourceDrift — deciding purely from the path's own segments, never a catalog read", () => {
  it("is undefined when both sides are the exact same shared-source version", () => {
    const path = sharedPath("5.0.0");

    expect(marketplaceSourceDrift(path, path, DRIFT_CONTEXT)).toBeUndefined();
  });

  it("is a version-behind drift when the registered version is ahead of what this run requests", () => {
    const drift = marketplaceSourceDrift(sharedPath("2.0.0"), sharedPath("1.0.0"), DRIFT_CONTEXT);

    expect(drift).toEqual({
      kind: "version-behind",
      registeredVersion: "2.0.0",
      requestedVersion: "1.0.0",
    });
  });

  // Bloquant 6/14: the version comparison must respect semver precedence, pre-release
  // included — a host on the final release and a run on its own release candidate of
  // the same version must not be told "no drift".
  it("is a version-behind drift when the registered version is a release and the requested one is that release's own pre-release", () => {
    const drift = marketplaceSourceDrift(
      sharedPath("5.3.0"),
      sharedPath("5.3.0-rc.1"),
      DRIFT_CONTEXT
    );

    expect(drift).toEqual({
      kind: "version-behind",
      registeredVersion: "5.3.0",
      requestedVersion: "5.3.0-rc.1",
    });
  });

  it("is undefined — a legitimate update, not a drift — when the requested version is ahead of the registered one", () => {
    expect(
      marketplaceSourceDrift(sharedPath("1.0.0"), sharedPath("2.0.0"), DRIFT_CONTEXT)
    ).toBeUndefined();
  });

  it("is an unmigrated-project-source drift when the registered path is this project's own pre-migration cache", () => {
    const registered = "/project/.aidd/cache/built/aidd-framework/claude";

    const drift = marketplaceSourceDrift(registered, sharedPath("1.0.0"), DRIFT_CONTEXT);

    expect(drift).toEqual({ kind: "unmigrated-project-source" });
  });

  it("is undefined when the requested path is not the shared user-scope shape at all", () => {
    expect(
      marketplaceSourceDrift(sharedPath("2.0.0"), "/some/other/path", DRIFT_CONTEXT)
    ).toBeUndefined();
  });

  it("is undefined when the registered path is a foreign source, neither shared nor this project's own cache", () => {
    expect(
      marketplaceSourceDrift("/completely/unrelated/src", sharedPath("1.0.0"), DRIFT_CONTEXT)
    ).toBeUndefined();
  });

  it("is undefined when the registered path names a different marketplace or tool under the shared cache root", () => {
    const registered = userBuiltMarketplaceDir(
      DRIFT_CONTEXT.userCacheRoot,
      "9.0.0",
      "other-mkt",
      "claude"
    );

    expect(marketplaceSourceDrift(registered, sharedPath("1.0.0"), DRIFT_CONTEXT)).toBeUndefined();
  });
});

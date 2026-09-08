import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dedupePathSegments,
  parseBuiltMarketplaceDir,
  parseBuiltMarketplaceDirAtAnyRoot,
  parseUserBuiltMarketplaceDir,
  pathContainsOrEquals,
  pathsOverlap,
  samePathSegment,
  userBuiltCacheRoot,
  userBuiltMarketplaceDir,
  userManifestPath,
} from "../../../../src/kernel/paths.js";

// A build refuses to write into the tree it reads from, and the cache-rebuild path takes a
// temp-dir detour when the two overlap. Both questions are asked here, so both are pinned
// here - with backslash-spelled paths, which is what a Windows run actually passes and
// what the two hardcoded "/" comparisons this replaced never recognised (#707).
describe("pathContainsOrEquals()", () => {
  it("sees the same directory spelled either way", () => {
    expect(pathContainsOrEquals("/a/b", "/a/b")).toBe(true);
    expect(pathContainsOrEquals("C:\\a\\b", "C:\\a\\b")).toBe(true);
  });

  it("sees a directory inside another, with either separator", () => {
    expect(pathContainsOrEquals("/a", "/a/b/c")).toBe(true);
    expect(pathContainsOrEquals("C:\\a", "C:\\a\\b\\c")).toBe(true);
  });

  it("does not mistake a shared name prefix for containment", () => {
    expect(pathContainsOrEquals("/a/build", "/a/build-cache")).toBe(false);
    expect(pathContainsOrEquals("C:\\a\\build", "C:\\a\\build-cache")).toBe(false);
  });

  it("answers in one direction only", () => {
    expect(pathContainsOrEquals("/a/b/c", "/a")).toBe(false);
    expect(pathContainsOrEquals("C:\\a\\b\\c", "C:\\a")).toBe(false);
  });

  it("separates unrelated directories", () => {
    expect(pathContainsOrEquals("/a", "/b")).toBe(false);
    expect(pathContainsOrEquals("C:\\a", "D:\\a")).toBe(false);
  });
});

describe("pathsOverlap()", () => {
  it("answers in both directions, with either separator", () => {
    expect(pathsOverlap("/a", "/a/b")).toBe(true);
    expect(pathsOverlap("/a/b", "/a")).toBe(true);
    expect(pathsOverlap("C:\\a", "C:\\a\\b")).toBe(true);
    expect(pathsOverlap("C:\\a\\b", "C:\\a")).toBe(true);
  });

  it("leaves genuinely separate trees alone", () => {
    expect(pathsOverlap("/a", "/b")).toBe(false);
    expect(pathsOverlap("C:\\src", "C:\\out")).toBe(false);
  });
});

// The shared source is one per CLI version, so a purge of one version is a single
// `rm -rf` on a directory aidd alone owns. Two versions must never resolve to the
// same directory, or that purge would take the other version's registrations with it.
describe("userBuiltMarketplaceDir()", () => {
  it("places the version segment before the marketplace name", () => {
    expect(userBuiltMarketplaceDir("/user-cache", "5.0.0", "aidd-framework", "claude")).toBe(
      join("/user-cache", "cache", "built", "5.0.0", "aidd-framework", "claude")
    );
  });

  it("produces disjoint directories for two different CLI versions", () => {
    const v1 = userBuiltMarketplaceDir("/user-cache", "1.0.0", "aidd-framework", "claude");
    const v2 = userBuiltMarketplaceDir("/user-cache", "2.0.0", "aidd-framework", "claude");

    expect(v1).not.toBe(v2);
    expect(pathContainsOrEquals(v1, v2)).toBe(false);
    expect(pathContainsOrEquals(v2, v1)).toBe(false);
  });
});

describe("userBuiltCacheRoot()", () => {
  it("is the parent every version directory sits under, one join above the version", () => {
    const root = userBuiltCacheRoot("/user-cache");
    const versioned = userBuiltMarketplaceDir("/user-cache", "5.0.0", "aidd-framework", "claude");

    expect(root).toBe(join("/user-cache", "cache", "built"));
    expect(pathContainsOrEquals(root, versioned)).toBe(true);
  });
});

describe("userManifestPath()", () => {
  it("names manifest.json directly under the user config dir, no .aidd nesting", () => {
    expect(userManifestPath("/user-cache")).toBe(join("/user-cache", "manifest.json"));
  });
});

describe("parseUserBuiltMarketplaceDir()", () => {
  it("reads back the version, marketplace name and target userBuiltMarketplaceDir encoded", () => {
    const path = userBuiltMarketplaceDir("/user-cache", "5.0.0", "aidd-framework", "claude");

    expect(parseUserBuiltMarketplaceDir("/user-cache", path)).toEqual({
      version: "5.0.0",
      marketplaceName: "aidd-framework",
      target: "claude",
    });
  });

  it("is undefined for a path outside the user cache root", () => {
    expect(
      parseUserBuiltMarketplaceDir("/user-cache", "/elsewhere/5.0.0/aidd-framework/claude")
    ).toBeUndefined();
  });

  it("is undefined for a path missing a segment", () => {
    expect(
      parseUserBuiltMarketplaceDir("/user-cache", "/user-cache/cache/built/5.0.0")
    ).toBeUndefined();
  });

  it("reads either separator, matching pathContainsOrEquals", () => {
    expect(
      parseUserBuiltMarketplaceDir(
        "C:\\user-cache",
        "C:\\user-cache\\cache\\built\\5.0.0\\aidd-framework\\claude"
      )
    ).toEqual({ version: "5.0.0", marketplaceName: "aidd-framework", target: "claude" });
  });

  // Bloquant 5/13: a real filesystem tolerates a trailing separator on a directory —
  // `userConfigDir()` returning one is not a corrupted path.
  it("tolerates a trailing separator on the user config dir", () => {
    const path = userBuiltMarketplaceDir("/user-cache", "5.0.0", "aidd-framework", "claude");

    expect(parseUserBuiltMarketplaceDir("/user-cache/", path)).toEqual({
      version: "5.0.0",
      marketplaceName: "aidd-framework",
      target: "claude",
    });
  });

  // Bloquant 5/13: on a case-insensitive platform (Windows), `C:\Users\A` and
  // `c:\users\a` are the same directory — the platform is passed explicitly rather
  // than read from `process.platform`, the same testable shape `mcp-exclusion.ts`
  // already uses.
  it("matches a case-differing user config dir on a case-insensitive platform", () => {
    expect(
      parseUserBuiltMarketplaceDir(
        "C:\\Users\\A",
        "c:\\users\\a\\cache\\built\\5.0.0\\aidd-framework\\claude",
        "win32"
      )
    ).toEqual({ version: "5.0.0", marketplaceName: "aidd-framework", target: "claude" });
  });

  it("does not fold case on a case-sensitive platform", () => {
    expect(
      parseUserBuiltMarketplaceDir(
        "/User-Cache",
        "/user-cache/cache/built/5.0.0/aidd-framework/claude",
        "linux"
      )
    ).toBeUndefined();
  });
});

describe("samePathSegment()", () => {
  it("compares case-sensitively on a case-sensitive platform", () => {
    expect(samePathSegment("aidd-framework", "AIDD-FRAMEWORK", "linux")).toBe(false);
  });

  it("compares case-insensitively on win32", () => {
    expect(samePathSegment("aidd-framework", "AIDD-FRAMEWORK", "win32")).toBe(true);
  });
});

describe("dedupePathSegments()", () => {
  it("collapses a win32 case-only spelling difference, keeping the first spelling", () => {
    expect(dedupePathSegments(["/A/proj", "/a/proj"], "win32")).toEqual(["/A/proj"]);
  });

  it("keeps both spellings on a case-sensitive platform", () => {
    expect(dedupePathSegments(["/A/proj", "/a/proj"], "linux")).toEqual(["/A/proj", "/a/proj"]);
  });
});

describe("parseBuiltMarketplaceDir()", () => {
  it("reads back the marketplace name and target from a project-scope built path", () => {
    expect(
      parseBuiltMarketplaceDir("/proj", "/proj/.aidd/cache/built/aidd-framework/claude")
    ).toEqual({
      marketplaceName: "aidd-framework",
      target: "claude",
    });
  });

  it("is undefined for a path outside the project root", () => {
    expect(
      parseBuiltMarketplaceDir("/proj", "/other/.aidd/cache/built/aidd-framework/claude")
    ).toBeUndefined();
  });
});

describe("parseBuiltMarketplaceDirAtAnyRoot()", () => {
  it("reads back the project root alongside the name and target, with no root known in advance", () => {
    expect(
      parseBuiltMarketplaceDirAtAnyRoot(
        "/other-project/.aidd/cache/built/aidd-framework/claude",
        "linux"
      )
    ).toEqual({
      projectRoot: "/other-project",
      marketplaceName: "aidd-framework",
      target: "claude",
    });
  });

  it("reads back a nested project root", () => {
    expect(
      parseBuiltMarketplaceDirAtAnyRoot(
        "/work/repos/other-project/.aidd/cache/built/aidd-framework/codex",
        "linux"
      )
    ).toEqual({
      projectRoot: "/work/repos/other-project",
      marketplaceName: "aidd-framework",
      target: "codex",
    });
  });

  it("is undefined for a path that never carries the built-cache shape at all", () => {
    expect(parseBuiltMarketplaceDirAtAnyRoot("/completely/unrelated/src")).toBeUndefined();
  });

  it("is undefined for a path with nothing before the marker — no project root to report", () => {
    expect(
      parseBuiltMarketplaceDirAtAnyRoot("/.aidd/cache/built/aidd-framework/claude")
    ).toBeUndefined();
  });

  it("compares the marker's own segments case-insensitively on win32", () => {
    expect(
      parseBuiltMarketplaceDirAtAnyRoot(
        "C:\\other-project\\.AIDD\\CACHE\\BUILT\\aidd-framework\\claude",
        "win32"
      )
    ).toEqual({
      projectRoot: "C:\\other-project",
      marketplaceName: "aidd-framework",
      target: "claude",
    });
  });

  // Every other writer of `references.json` records a `realpath` result, which is
  // backslash-separated on win32 — a forward-slash `projectRoot` here would never
  // compare equal to one of those (`samePathSegment` folds case, never separators),
  // so a foreign project's own claim on the shared source would never be recognised
  // as the same project twice (#lot-6-S5).
  it("keeps the platform's own separator in the returned project root on win32", () => {
    expect(
      parseBuiltMarketplaceDirAtAnyRoot(
        "C:\\proj\\.aidd\\cache\\built\\aidd-framework\\claude",
        "win32"
      )
    ).toEqual({
      projectRoot: "C:\\proj",
      marketplaceName: "aidd-framework",
      target: "claude",
    });
  });

  it("reads back a nested win32 project root with backslashes throughout", () => {
    expect(
      parseBuiltMarketplaceDirAtAnyRoot(
        "C:\\work\\repos\\other-project\\.aidd\\cache\\built\\aidd-framework\\codex",
        "win32"
      )
    ).toEqual({
      projectRoot: "C:\\work\\repos\\other-project",
      marketplaceName: "aidd-framework",
      target: "codex",
    });
  });
});

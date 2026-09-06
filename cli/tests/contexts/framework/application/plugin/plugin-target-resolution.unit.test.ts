import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import {
  resolveBaseDirFromRecord,
  resolveScopeForInstall,
} from "../../../../../src/contexts/framework/application/plugin/plugin-target-resolution.js";
import { UnresolvableUserScopeError } from "../../../../../src/kernel/errors.js";

const HOME = "/home/u";
const homedir = () => HOME;

describe("resolveScopeForInstall()", () => {
  it("reads the scope a fresh install writes from the tool's own profile", () => {
    expect(resolveScopeForInstall("cursor")).toBe("user");
    expect(resolveScopeForInstall("claude")).toBe("project");
  });
});

describe("resolveBaseDirFromRecord() — the manifest's recorded scope, not the profile", () => {
  it("resolves project scope to projectRoot regardless of what the tool's profile says", () => {
    // cursor's own profile declares installScope "user" — a manifest entry recorded
    // scope: "project" must still resolve under projectRoot, never under the
    // user-scope plugins dir the profile would otherwise pick.
    const baseDir = resolveBaseDirFromRecord("project", "cursor", "/proj", homedir);
    expect(baseDir).toBe("/proj");
    expect(baseDir).not.toContain(join(".cursor", "plugins", "local"));
  });

  it("resolves user scope to the tool's user-scope plugins dir", () => {
    const baseDir = resolveBaseDirFromRecord("user", "cursor", "/proj", homedir);
    expect(baseDir).toBe(join(HOME, ".cursor", "plugins", "local"));
  });

  // The guard: a "user" scope the tool's current profile cannot explain must refuse
  // to guess, not quietly resolve under projectRoot. Mutation that proves it: replace
  // the throw with `?? projectRoot` and this test goes red, because claude's profile
  // declares no user-scope plugins directory at all.
  it("throws, rather than falling back to projectRoot, when the tool declares no user-scope directory", () => {
    expect(() => resolveBaseDirFromRecord("user", "claude", "/proj", homedir)).toThrow(
      UnresolvableUserScopeError
    );
  });
});

import { describe, expect, it } from "vitest";
import { isStrictlyWithinUserScope } from "../../../../../src/contexts/framework/domain/plugins/user-scope-containment.js";

const BOUNDARY = "/home/dev/.cursor/plugins/local";

describe("isStrictlyWithinUserScope", () => {
  it("accepts a plugin's own subdirectory inside the boundary", () => {
    expect(isStrictlyWithinUserScope(`${BOUNDARY}/aidd-context/skills/hello.md`, BOUNDARY)).toBe(
      true
    );
  });

  it("rejects a manifest entry whose `..` segments resolve outside the boundary", () => {
    // What a real `realpath` returns for `${BOUNDARY}/aidd-context/../../../.ssh/id_rsa` —
    // this function trusts its caller already resolved the path, it only compares.
    const escapedViaDotDot = "/home/dev/.ssh/id_rsa";
    expect(isStrictlyWithinUserScope(escapedViaDotDot, BOUNDARY)).toBe(false);
  });

  it("rejects a symlinked plugin directory whose real location is outside the boundary", () => {
    // What `realpath` returns when `${BOUNDARY}/aidd-context` is itself a symlink to
    // somewhere else on disk — no `..` anywhere in the manifest's own path this time.
    const escapedViaSymlink = "/tmp/evil/payload";
    expect(isStrictlyWithinUserScope(escapedViaSymlink, BOUNDARY)).toBe(false);
  });

  it("rejects the boundary directory itself, never treating it as its own plugin", () => {
    expect(isStrictlyWithinUserScope(BOUNDARY, BOUNDARY)).toBe(false);
  });

  it("rejects the boundary directory spelled with a trailing separator", () => {
    expect(isStrictlyWithinUserScope(`${BOUNDARY}/`, BOUNDARY)).toBe(false);
  });

  it("rejects a path that merely starts with the boundary's characters without a separator", () => {
    // Textually starts with BOUNDARY but is a sibling directory, not something inside it —
    // a naive `startsWith` would wrongly accept this.
    expect(isStrictlyWithinUserScope(`${BOUNDARY}-evil/payload`, BOUNDARY)).toBe(false);
  });
});

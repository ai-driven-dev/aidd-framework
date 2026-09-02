import { describe, expect, it } from "vitest";
import { injectTokenIntoUrl } from "../../../src/runtime/git/inject-token.js";

describe("injectTokenIntoUrl", () => {
  it("returns the URL unchanged when token is undefined", () => {
    const url = "https://github.com/owner/repo.git";
    expect(injectTokenIntoUrl(url, undefined)).toBe(url);
  });

  it("does not modify ssh URLs", () => {
    const ssh = "git@github.com:owner/repo.git";
    expect(injectTokenIntoUrl(ssh, "tk")).toBe(ssh);
  });

  it("uses x-access-token for github", () => {
    expect(injectTokenIntoUrl("https://github.com/owner/repo.git", "tk")).toBe(
      "https://x-access-token:tk@github.com/owner/repo.git"
    );
  });

  it("uses oauth2 for gitlab", () => {
    expect(injectTokenIntoUrl("https://gitlab.com/owner/repo.git", "tk")).toBe(
      "https://oauth2:tk@gitlab.com/owner/repo.git"
    );
  });

  it("uses x-token-auth for bitbucket", () => {
    expect(injectTokenIntoUrl("https://bitbucket.org/owner/repo.git", "tk")).toBe(
      "https://x-token-auth:tk@bitbucket.org/owner/repo.git"
    );
  });

  it("falls back to bare-token form for unknown hosts", () => {
    expect(injectTokenIntoUrl("https://example.com/owner/repo.git", "tk")).toBe(
      "https://tk@example.com/owner/repo.git"
    );
  });
});

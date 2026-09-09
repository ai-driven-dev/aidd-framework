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

  it("matches a known forge on a subdomain of it", () => {
    expect(injectTokenIntoUrl("https://gist.github.com/owner/repo.git", "tk")).toBe(
      "https://x-access-token:tk@gist.github.com/owner/repo.git"
    );
  });

  it("does not treat a known host appearing in the path as that host", () => {
    expect(injectTokenIntoUrl("https://evil.example/github.com/owner/repo.git", "tk")).toBe(
      "https://tk@evil.example/github.com/owner/repo.git"
    );
  });

  it("does not treat a host merely ending in a known host's name as that host", () => {
    expect(injectTokenIntoUrl("https://notgithub.com/owner/repo.git", "tk")).toBe(
      "https://tk@notgithub.com/owner/repo.git"
    );
  });

  it("does not treat a known host in the query string as that host", () => {
    expect(injectTokenIntoUrl("https://example.com/repo.git?from=gitlab.com", "tk")).toBe(
      "https://tk@example.com/repo.git?from=gitlab.com"
    );
  });

  it("leaves a string that is not a parseable URL untouched", () => {
    expect(injectTokenIntoUrl("https://", "tk")).toBe("https://");
  });
});

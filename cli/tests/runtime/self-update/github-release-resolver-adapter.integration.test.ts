import { describe, expect, it, vi } from "vitest";
import { HttpNotFoundError } from "../../../src/infrastructure/errors.js";
import {
  AuthenticationError,
  CatalogFetchAuthError,
  CatalogFetchError,
} from "../../../src/kernel/errors.js";
import { GitHubReleaseResolverAdapter } from "../../../src/runtime/self-update/github-release-resolver-adapter.js";

const REPO = "owner/repo";

function makeHttp(body: unknown, statusCode = 200) {
  return {
    get: vi.fn().mockResolvedValue({ body, statusCode, contentType: "application/json" }),
  };
}

function makeHttpThrowing(err: Error) {
  return { get: vi.fn().mockRejectedValue(err) };
}

describe("GitHubReleaseResolverAdapter", () => {
  describe("resolveLatest", () => {
    it("returns tag_name from first element on successful response with releases", async () => {
      const http = makeHttp([{ tag_name: "v1.2.3" }]);
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      const result = await adapter.resolveLatest(REPO);
      expect(result).toBe("v1.2.3");
    });

    it("calls the correct GitHub releases?per_page=1 URL", async () => {
      const http = makeHttp([{ tag_name: "v1.0.0" }]);
      const tokenProvider = { resolve: async () => "my-token" as string | null };
      const adapter = new GitHubReleaseResolverAdapter(http as never, tokenProvider);
      await adapter.resolveLatest(REPO);
      expect(http.get).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/releases?per_page=1",
        { token: "my-token" }
      );
    });

    it("returns null when response body is an empty array", async () => {
      const http = makeHttp([]);
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      const result = await adapter.resolveLatest(REPO);
      expect(result).toBeNull();
    });

    it("returns null when response body is not an array", async () => {
      const http = makeHttp({ message: "Not Found" });
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      const result = await adapter.resolveLatest(REPO);
      expect(result).toBeNull();
    });

    it("returns null on HTTP 404 (no releases)", async () => {
      const http = makeHttpThrowing(
        new HttpNotFoundError("https://api.github.com/repos/owner/repo/releases/latest")
      );
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      const result = await adapter.resolveLatest(REPO);
      expect(result).toBeNull();
    });

    it("throws CatalogFetchAuthError on HTTP 401/403", async () => {
      const http = makeHttpThrowing(new AuthenticationError("HTTP 401"));
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      await expect(adapter.resolveLatest(REPO)).rejects.toThrow(CatalogFetchAuthError);
    });

    it("throws CatalogFetchError on network error", async () => {
      const http = makeHttpThrowing(new Error("ECONNREFUSED"));
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      await expect(adapter.resolveLatest(REPO)).rejects.toThrow(CatalogFetchError);
    });
  });

  describe("listRootReleases", () => {
    it("keeps only root tags and drops release-please per-component tags", async () => {
      const http = makeHttp([
        { tag_name: "aidd-refine-v1.0.0" },
        { tag_name: "aidd-context-v1.0.0" },
        { tag_name: "v4.0.0" },
        { tag_name: "v3.9.1" },
        { tag_name: "v3.7.3-pm.1" },
      ]);
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      const result = await adapter.listRootReleases(REPO);
      expect(result).toEqual(["v4.0.0", "v3.9.1", "v3.7.3-pm.1"]);
    });

    it("preserves GitHub order (newest first) for root tags", async () => {
      const http = makeHttp([{ tag_name: "v4.0.0" }, { tag_name: "v3.9.1" }]);
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      const result = await adapter.listRootReleases(REPO);
      expect(result[0]).toBe("v4.0.0");
    });

    it("requests per_page=100 so root tags are not buried", async () => {
      const http = makeHttp([{ tag_name: "v1.0.0" }]);
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      await adapter.listRootReleases(REPO);
      expect(http.get).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/releases?per_page=100",
        { token: undefined }
      );
    });

    it("returns empty array when repo has no releases (404)", async () => {
      const http = makeHttpThrowing(
        new HttpNotFoundError("https://api.github.com/repos/owner/repo/releases")
      );
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      const result = await adapter.listRootReleases(REPO);
      expect(result).toEqual([]);
    });

    it("throws CatalogFetchAuthError on HTTP 401/403", async () => {
      const http = makeHttpThrowing(new AuthenticationError("HTTP 401"));
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      await expect(adapter.listRootReleases(REPO)).rejects.toThrow(CatalogFetchAuthError);
    });
  });

  describe("isRepoPublic", () => {
    it("returns true when the unauthenticated repo request succeeds (public)", async () => {
      const http = makeHttp({ full_name: REPO, private: false });
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      expect(await adapter.isRepoPublic(REPO)).toBe(true);
      expect(http.get).toHaveBeenCalledWith("https://api.github.com/repos/owner/repo");
    });

    it("returns false on 404 (private or non-existent repo)", async () => {
      const http = makeHttpThrowing(
        new HttpNotFoundError("https://api.github.com/repos/owner/repo")
      );
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      expect(await adapter.isRepoPublic(REPO)).toBe(false);
    });

    it("returns true on non-404 errors so a rate-limited public user is not gated", async () => {
      const http = makeHttpThrowing(new AuthenticationError("HTTP 403 rate limit"));
      const adapter = new GitHubReleaseResolverAdapter(http as never);
      expect(await adapter.isRepoPublic(REPO)).toBe(true);
    });
  });
});

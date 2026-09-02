import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubRawFetcherAdapter } from "../../../../src/contexts/distribution/infrastructure/github-raw-fetcher-adapter.js";
import { HttpNotFoundError } from "../../../../src/infrastructure/errors.js";
import {
  AuthenticationError,
  CatalogFetchAuthError,
  CatalogFetchError,
  CatalogFetchNotFoundError,
} from "../../../../src/kernel/errors.js";

const CATALOG_PATH = ".claude-plugin/marketplace.json";
const SAMPLE_CATALOG = JSON.stringify({ plugins: [] });

function makeHttp(override: Partial<{ get: ReturnType<typeof vi.fn> }> = {}) {
  return {
    get:
      override.get ??
      vi.fn().mockResolvedValue({
        body: Buffer.from(SAMPLE_CATALOG),
        statusCode: 200,
        contentType: "application/json",
      }),
  };
}

describe("GitHubRawFetcherAdapter", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aidd-raw-fetcher-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("fetchCatalog", () => {
    it("returns local cache dir and writes catalog file on HTTP 200", async () => {
      const http = makeHttp();
      const adapter = new GitHubRawFetcherAdapter(http as never);

      const result = await adapter.fetchCatalog(
        { kind: "github", repo: "owner/repo" },
        CATALOG_PATH,
        tmpDir
      );

      expect(result).toBe(tmpDir);
      const { existsSync } = await import("node:fs");
      expect(existsSync(join(tmpDir, CATALOG_PATH))).toBe(true);
    });

    it("calls GitHub Contents API with correct URL and auth header", async () => {
      const http = makeHttp();
      const tokenProvider = { resolve: async () => "my-token" as string | null };
      const adapter = new GitHubRawFetcherAdapter(http as never, tokenProvider);

      await adapter.fetchCatalog(
        { kind: "github", repo: "owner/repo", ref: "main" },
        CATALOG_PATH,
        tmpDir
      );

      expect(http.get).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/contents/.claude-plugin/marketplace.json?ref=main",
        { token: "my-token", accept: "application/vnd.github.raw" }
      );
    });

    it("uses HEAD as ref when none specified", async () => {
      const http = makeHttp();
      const adapter = new GitHubRawFetcherAdapter(http as never);

      await adapter.fetchCatalog({ kind: "github", repo: "owner/repo" }, CATALOG_PATH, tmpDir);

      expect(http.get).toHaveBeenCalledWith(
        expect.stringContaining("?ref=HEAD"),
        expect.anything()
      );
    });

    it("throws CatalogFetchNotFoundError on HTTP 404", async () => {
      const http = makeHttp({
        get: vi.fn().mockRejectedValue(new HttpNotFoundError("https://api.github.com/...")),
      });
      const adapter = new GitHubRawFetcherAdapter(http as never);

      await expect(
        adapter.fetchCatalog({ kind: "github", repo: "owner/repo" }, CATALOG_PATH, tmpDir)
      ).rejects.toThrow(CatalogFetchNotFoundError);
    });

    it("throws CatalogFetchAuthError on HTTP 401/403", async () => {
      const http = makeHttp({
        get: vi.fn().mockRejectedValue(new AuthenticationError("HTTP 403")),
      });
      const adapter = new GitHubRawFetcherAdapter(http as never);

      await expect(
        adapter.fetchCatalog({ kind: "github", repo: "owner/repo" }, CATALOG_PATH, tmpDir)
      ).rejects.toThrow(CatalogFetchAuthError);
    });

    it("throws CatalogFetchError on network error", async () => {
      const http = makeHttp({
        get: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      });
      const adapter = new GitHubRawFetcherAdapter(http as never);

      await expect(
        adapter.fetchCatalog({ kind: "github", repo: "owner/repo" }, CATALOG_PATH, tmpDir)
      ).rejects.toThrow(CatalogFetchError);
    });
  });
});

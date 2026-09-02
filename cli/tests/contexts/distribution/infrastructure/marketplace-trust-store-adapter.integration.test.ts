import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MarketplaceTrustStoreAdapter } from "../../../../src/contexts/distribution/infrastructure/marketplace-trust-store-adapter.js";
import { HasherAdapter } from "../../../../src/infrastructure/adapters/hasher-adapter.js";
import type { PluginSource } from "../../../../src/kernel/source.js";

const githubSource: PluginSource = { kind: "github", repo: "owner/repo" };
const otherSource: PluginSource = { kind: "github", repo: "owner/other" };

describe("MarketplaceTrustStoreAdapter", () => {
  let projectRoot: string;
  let store: MarketplaceTrustStoreAdapter;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "trust-store-test-"));
    store = new MarketplaceTrustStoreAdapter(new HasherAdapter());
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  describe("isTrusted()", () => {
    it("returns false when the file does not exist", async () => {
      const result = await store.isTrusted(projectRoot, githubSource);
      expect(result).toBe(false);
    });

    it("returns true after trust is recorded", async () => {
      await store.trust(projectRoot, githubSource);
      expect(await store.isTrusted(projectRoot, githubSource)).toBe(true);
    });

    it("returns false for a different source", async () => {
      await store.trust(projectRoot, githubSource);
      expect(await store.isTrusted(projectRoot, otherSource)).toBe(false);
    });
  });

  describe("trust()", () => {
    it("creates the cache directory and persists the trust file", async () => {
      await store.trust(projectRoot, githubSource);
      const raw = await readFile(
        join(projectRoot, ".aidd", "cache", "trusted-marketplaces.json"),
        "utf-8"
      );
      const parsed = JSON.parse(raw);
      expect(parsed.version).toBe(1);
      expect(parsed.trusted).toHaveLength(1);
    });

    it("is idempotent — calling twice does not duplicate", async () => {
      await store.trust(projectRoot, githubSource);
      await store.trust(projectRoot, githubSource);
      const raw = await readFile(
        join(projectRoot, ".aidd", "cache", "trusted-marketplaces.json"),
        "utf-8"
      );
      const parsed = JSON.parse(raw);
      expect(parsed.trusted).toHaveLength(1);
    });

    it("appends additional sources without removing existing ones", async () => {
      await store.trust(projectRoot, githubSource);
      await store.trust(projectRoot, otherSource);
      expect(await store.isTrusted(projectRoot, githubSource)).toBe(true);
      expect(await store.isTrusted(projectRoot, otherSource)).toBe(true);
    });
  });

  describe("per-repo isolation", () => {
    it("trust in one project does not leak into another", async () => {
      const otherProject = await mkdtemp(join(tmpdir(), "trust-store-other-"));
      try {
        await store.trust(projectRoot, githubSource);
        const result = await store.isTrusted(otherProject, githubSource);
        expect(result).toBe(false);
      } finally {
        await rm(otherProject, { recursive: true, force: true });
      }
    });
  });
});

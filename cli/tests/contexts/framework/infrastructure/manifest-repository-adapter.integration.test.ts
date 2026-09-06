import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { ManifestRepositoryAdapter } from "../../../../src/contexts/framework/infrastructure/manifest-repository-adapter.js";

describe("ManifestRepositoryAdapter", () => {
  let tempDir: string;
  let adapter: ManifestRepositoryAdapter;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `manifest-repo-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    adapter = new ManifestRepositoryAdapter(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("load()", () => {
    it("returns null when manifest file does not exist", async () => {
      const result = await adapter.load();
      expect(result).toBeNull();
    });

    it("rejects, rather than returning null, when manifest.json is a directory", async () => {
      const manifestDir = join(tempDir, ".aidd", "manifest.json");
      await mkdir(manifestDir, { recursive: true });

      await expect(adapter.load()).rejects.toThrow();
    });

    it("rejects with an instructive error naming the file when manifest.json is truncated", async () => {
      const manifestPath = join(tempDir, ".aidd", "manifest.json");
      await mkdir(join(tempDir, ".aidd"), { recursive: true });
      await writeFile(manifestPath, '{"version": 6, "tools": {');

      await expect(adapter.load()).rejects.toThrow(manifestPath);
    });
  });

  describe("save() + load() roundtrip", () => {
    it("persists and restores manifest without data loss", async () => {
      const manifest = Manifest.create();
      await adapter.save(manifest);

      const loaded = await adapter.load();
      expect(loaded).not.toBeNull();
      expect(loaded?.getInstalledToolIds()).toHaveLength(0);
    });

    it("manifest version is 6 after roundtrip", async () => {
      const manifest = Manifest.create();
      await adapter.save(manifest);

      const loaded = await adapter.load();
      const json = loaded?.toJSON();
      expect(json?.version).toBe(6);
      expect("marketplaces" in (json ?? {})).toBe(false);
      expect("docsDir" in (json ?? {})).toBe(false);
    });
  });

  describe("delete()", () => {
    it("deletes manifest file from disk", async () => {
      const manifest = Manifest.create();
      await adapter.save(manifest);

      await adapter.delete();

      const result = await adapter.load();
      expect(result).toBeNull();
    });

    it("prunes empty .aidd/ directory after manifest deletion", async () => {
      const manifest = Manifest.create();
      await adapter.save(manifest);

      await adapter.delete();

      const { existsSync } = await import("node:fs");
      const aiddDir = join(tempDir, ".aidd");
      expect(existsSync(aiddDir)).toBe(false);
    });

    it("silently succeeds when no manifest to delete", async () => {
      await expect(adapter.delete()).resolves.toBeUndefined();
    });
  });

  describe("manifest persistence", () => {
    it("creates .aidd/ directory if it does not exist", async () => {
      const manifest = Manifest.create();
      await adapter.save(manifest);

      const { existsSync } = await import("node:fs");
      expect(existsSync(join(tempDir, ".aidd", "manifest.json"))).toBe(true);
    });
  });
});

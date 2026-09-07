import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { UserManifestRepositoryAdapter } from "../../../../src/contexts/framework/infrastructure/user-manifest-repository-adapter.js";

describe("UserManifestRepositoryAdapter", () => {
  let userConfigDir: string;
  let adapter: UserManifestRepositoryAdapter;

  beforeEach(async () => {
    userConfigDir = join(tmpdir(), `user-manifest-repo-test-${Date.now()}`);
    await mkdir(userConfigDir, { recursive: true });
    adapter = new UserManifestRepositoryAdapter(() => userConfigDir);
  });

  afterEach(async () => {
    await rm(userConfigDir, { recursive: true, force: true });
  });

  it("names manifest.json directly under the user config dir, no .aidd nesting", () => {
    expect(adapter.path).toBe(join(userConfigDir, "manifest.json"));
  });

  describe("load()", () => {
    it("returns null when manifest.json does not exist", async () => {
      expect(await adapter.load()).toBeNull();
    });

    it("rejects with an instructive error naming the file when manifest.json is truncated", async () => {
      const manifestPath = join(userConfigDir, "manifest.json");
      await writeFile(manifestPath, '{"version": 8, "tools": {');

      await expect(adapter.load()).rejects.toThrow(manifestPath);
    });

    it('rejects a refused manifest version naming the real user manifest path and `aidd setup --scope user`, never .aidd/manifest.json or "in this project"', async () => {
      const manifestPath = join(userConfigDir, "manifest.json");
      await writeFile(manifestPath, '{"version": 7, "tools": {}}');

      await expect(adapter.load()).rejects.toThrow(
        new RegExp(
          `${manifestPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*aidd setup --scope user`
        )
      );
      await expect(adapter.load()).rejects.not.toThrow(/\.aidd\/manifest\.json/);
      await expect(adapter.load()).rejects.not.toThrow(/in this project/);
    });
  });

  describe("save() + load() roundtrip", () => {
    it("persists and restores the manifest without data loss", async () => {
      const manifest = Manifest.create();
      await adapter.save(manifest);

      const loaded = await adapter.load();
      expect(loaded?.getInstalledToolIds()).toHaveLength(0);
    });

    it("manifest version is 8 after roundtrip — same schema, same version as the project manifest", async () => {
      const manifest = Manifest.create();
      await adapter.save(manifest);

      const loaded = await adapter.load();
      expect(loaded?.toJSON().version).toBe(8);
    });
  });

  describe("delete()", () => {
    it("deletes manifest.json from disk", async () => {
      const manifest = Manifest.create();
      await adapter.save(manifest);

      await adapter.delete();

      expect(await adapter.load()).toBeNull();
    });

    it("never removes the user config dir itself — auth.json, marketplaces.json and references.json live there too", async () => {
      const manifest = Manifest.create();
      await adapter.save(manifest);
      // A neighbour this adapter must never touch, standing in for auth.json /
      // marketplaces.json / references.json / telemetry/, all of which also live
      // directly under userConfigDir.
      const neighbour = join(userConfigDir, "marketplaces.json");
      await writeFile(neighbour, "{}");

      await adapter.delete();

      expect(existsSync(userConfigDir)).toBe(true);
      expect(existsSync(neighbour)).toBe(true);
    });

    it("silently succeeds when there is no manifest to delete", async () => {
      await expect(adapter.delete()).resolves.toBeUndefined();
    });
  });

  describe("manifest persistence", () => {
    it("creates the user config dir if it does not exist yet", async () => {
      const freshDir = join(userConfigDir, "not-yet-created");
      const freshAdapter = new UserManifestRepositoryAdapter(() => freshDir);

      await freshAdapter.save(Manifest.create());

      expect(existsSync(join(freshDir, "manifest.json"))).toBe(true);
    });
  });
});

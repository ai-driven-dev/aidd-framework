import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Marketplace,
  type MarketplaceData,
} from "../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceRegistryAdapter } from "../../../../src/contexts/distribution/infrastructure/marketplace-registry-adapter.js";

const baseData = (overrides: Partial<MarketplaceData> = {}): MarketplaceData => ({
  name: "awesome",
  source: { kind: "github", repo: "owner/awesome" },
  scope: "project",
  addedAt: "2026-04-28T10:00:00.000Z",
  ...overrides,
});

describe("MarketplaceRegistryAdapter", () => {
  let projectRoot: string;
  let homeDir: string;
  let originalHome: string | undefined;
  let originalConfigDir: string | undefined;
  let originalUserProfile: string | undefined;
  let adapter: MarketplaceRegistryAdapter;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "marketplace-registry-project-"));
    homeDir = await mkdtemp(join(tmpdir(), "marketplace-registry-home-"));
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    originalConfigDir = process.env.AIDD_USER_CONFIG_DIR;
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    // Faking the home alone is not enough: the CLI only falls back to `homedir()` when
    // `AIDD_USER_CONFIG_DIR` is unset, so a value leaking in from elsewhere sends this
    // test at a real user registry. Measured — it read two marketplaces of the
    // developer's own and expected none.
    process.env.AIDD_USER_CONFIG_DIR = join(homeDir, ".config", "aidd");
    adapter = new MarketplaceRegistryAdapter();
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    if (originalConfigDir === undefined) delete process.env.AIDD_USER_CONFIG_DIR;
    else process.env.AIDD_USER_CONFIG_DIR = originalConfigDir;
    process.env.USERPROFILE = originalUserProfile;
    await rm(projectRoot, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  });

  describe("list()", () => {
    it("returns empty when neither layer exists", async () => {
      const result = await adapter.list(projectRoot);
      expect(result).toEqual([]);
    });

    it("returns project entries first, user entries after", async () => {
      const project = Marketplace.fromJSON(baseData({ name: "p1" }));
      const user = Marketplace.fromJSON(baseData({ name: "u1", scope: "user" }));
      await adapter.save(projectRoot, project);
      await adapter.save(projectRoot, user);

      const result = await adapter.list(projectRoot);

      expect(result.map((m) => m.name)).toEqual(["p1", "u1"]);
      expect(result[0]?.scope).toBe("project");
      expect(result[1]?.scope).toBe("user");
    });

    it("project entry shadows user entry with the same name", async () => {
      const project = Marketplace.fromJSON(
        baseData({ name: "shared", source: { kind: "github", repo: "owner/project" } })
      );
      const user = Marketplace.fromJSON(
        baseData({
          name: "shared",
          scope: "user",
          source: { kind: "github", repo: "owner/user" },
        })
      );
      await adapter.save(projectRoot, project);
      await adapter.save(projectRoot, user);

      const result = await adapter.list(projectRoot);

      expect(result).toHaveLength(1);
      expect(result[0]?.scope).toBe("project");
      if (result[0]?.source.kind === "github") {
        expect(result[0]?.source.repo).toBe("owner/project");
      }
    });
  });

  describe("save()", () => {
    it("persists project entries to .aidd/marketplaces.json", async () => {
      const m = Marketplace.fromJSON(baseData());
      await adapter.save(projectRoot, m);

      const raw = await readFile(join(projectRoot, ".aidd", "marketplaces.json"), "utf-8");
      expect(JSON.parse(raw)).toEqual({
        version: 1,
        marketplaces: [m.toJSON()],
      });
    });

    it("persists user entries to ~/.config/aidd/marketplaces.json", async () => {
      const m = Marketplace.fromJSON(baseData({ scope: "user" }));
      await adapter.save(projectRoot, m);

      const raw = await readFile(join(homeDir, ".config", "aidd", "marketplaces.json"), "utf-8");
      expect(JSON.parse(raw).marketplaces).toHaveLength(1);
    });

    it("overwrites entry with same name in same scope", async () => {
      const first = Marketplace.fromJSON(baseData());
      await adapter.save(projectRoot, first);
      const second = first.withLastFetched("2026-04-28T11:00:00.000Z");
      await adapter.save(projectRoot, second);

      const result = await adapter.list(projectRoot);
      expect(result).toHaveLength(1);
      expect(result[0]?.lastFetched).toBe("2026-04-28T11:00:00.000Z");
    });
  });

  describe("delete()", () => {
    it("removes the entry from the given scope only", async () => {
      const project = Marketplace.fromJSON(baseData({ name: "shared" }));
      const user = Marketplace.fromJSON(baseData({ name: "shared", scope: "user" }));
      await adapter.save(projectRoot, project);
      await adapter.save(projectRoot, user);

      await adapter.delete(projectRoot, "shared", "project");

      const result = await adapter.list(projectRoot);
      expect(result).toHaveLength(1);
      expect(result[0]?.scope).toBe("user");
    });

    it("silently succeeds when entry is missing", async () => {
      await expect(adapter.delete(projectRoot, "missing", "project")).resolves.toBeUndefined();
    });
  });

  describe("updateLastFetched()", () => {
    it("updates timestamp on the named entry", async () => {
      const m = Marketplace.fromJSON(baseData());
      await adapter.save(projectRoot, m);

      await adapter.updateLastFetched(projectRoot, m.name, "project", "2026-04-28T12:00:00.000Z");

      const result = await adapter.list(projectRoot);
      expect(result[0]?.lastFetched).toBe("2026-04-28T12:00:00.000Z");
    });

    it("leaves other entries untouched", async () => {
      const a = Marketplace.fromJSON(baseData({ name: "a" }));
      const b = Marketplace.fromJSON(baseData({ name: "b" }));
      await adapter.save(projectRoot, a);
      await adapter.save(projectRoot, b);

      await adapter.updateLastFetched(projectRoot, "a", "project", "2026-04-28T12:00:00.000Z");

      const result = await adapter.list(projectRoot);
      const bEntry = result.find((m) => m.name === "b");
      expect(bEntry?.lastFetched).toBeUndefined();
    });
  });

  describe("schema versioning", () => {
    it("loads files written under the current version", async () => {
      const dir = join(projectRoot, ".aidd");
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "marketplaces.json"),
        JSON.stringify({
          version: 1,
          marketplaces: [baseData()],
        })
      );

      const result = await adapter.list(projectRoot);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("awesome");
    });
  });
});

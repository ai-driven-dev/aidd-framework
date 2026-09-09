import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const FRAMEWORK_REAL_PATH = resolve(process.cwd(), "tests/fixtures/framework-real");

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
}

async function exists(path: string): Promise<boolean> {
  return await stat(path)
    .then(() => true)
    .catch(() => false);
}

/**
 * The pre-migration shape, which no code path still writes: a project-scope registry entry,
 * its build under `.aidd/cache/built/`, and a shared registry that knows nothing of it.
 */
async function seedPreMigrationState(projectDir: string, fakeHome: string): Promise<void> {
  const userConfigDir = join(fakeHome, ".config", "aidd");
  const builtRoot = join(userConfigDir, "cache", "built");
  const [version] = await readdir(builtRoot);
  if (version === undefined) throw new Error("setup did not build the shared source");
  const sharedBuiltClaude = join(builtRoot, version, "aidd-framework", "claude");
  const projectCacheClaude = join(
    projectDir,
    ".aidd",
    "cache",
    "built",
    "aidd-framework",
    "claude"
  );
  await mkdir(join(projectDir, ".aidd", "cache", "built", "aidd-framework"), { recursive: true });
  await cp(sharedBuiltClaude, projectCacheClaude, { recursive: true });

  await writeFile(
    join(userConfigDir, "marketplaces.json"),
    JSON.stringify({ version: 1, marketplaces: [] }, null, 2)
  );
  await rm(join(userConfigDir, "references.json"), { force: true });

  await writeFile(
    join(projectDir, ".aidd", "marketplaces.json"),
    JSON.stringify(
      {
        version: 1,
        marketplaces: [
          {
            name: "aidd-framework",
            source: { kind: "local", path: FRAMEWORK_REAL_PATH },
            scope: "project",
            addedAt: "2020-01-01T00:00:00.000Z",
          },
        ],
      },
      null,
      2
    )
  );
}

describe("E2E: sync migrates a project installed before the shared source", () => {
  it("moves the registry entry to user scope, keeps this project's own stale cache while claude's binary stays off PATH in this sandbox, and warns why", async () => {
    const env = await createTestEnv("sync-migrates-project-scope");
    try {
      const setupResult = await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          FRAMEWORK_REAL_PATH,
          "--ai",
          "claude",
          "--plugins",
          "none",
          "--yes",
        ],
        env.projectDir,
        env.fakeHome
      );
      expect(setupResult.exitCode).toBe(0);

      await seedPreMigrationState(env.projectDir, env.fakeHome);

      const userConfigDir = join(env.fakeHome, ".config", "aidd");
      const projectCacheDir = join(env.projectDir, ".aidd", "cache", "built", "aidd-framework");
      expect(
        (
          (await readJson(join(env.fakeHome, ".config", "aidd", "marketplaces.json")))
            .marketplaces as unknown[]
        ).length
      ).toBe(0);
      expect(await exists(projectCacheDir)).toBe(true);

      const syncResult = await runCli(["sync"], env.projectDir, env.fakeHome);

      expect(syncResult.exitCode).toBe(0);
      expect(syncResult.stderr).toContain(
        "claude: the plugin will not load until the claude CLI has run."
      );

      const userMarketplaces = await readJson(join(userConfigDir, "marketplaces.json"));
      const migrated = (
        userMarketplaces.marketplaces as Array<{ name: string; scope: string }>
      ).find((m) => m.name === "aidd-framework");
      expect(migrated?.scope).toBe("user");

      const projectMarketplaces = await readJson(
        join(env.projectDir, ".aidd", "marketplaces.json")
      );
      expect(
        (projectMarketplaces.marketplaces as Array<{ name: string }>).some(
          (m) => m.name === "aidd-framework"
        )
      ).toBe(false);

      // claude's binary never ran in this sandbox, so a host registration still naming
      // this cache never moved off it: purging it would leave nothing to resolve.
      expect(await exists(projectCacheDir)).toBe(true);
      expect(syncResult.stderr).toContain("pre-migration framework cache kept");

      const doctorResult = await runCli(["doctor"], env.projectDir, env.fakeHome);
      expect(doctorResult.exitCode).toBe(0);
      expect(doctorResult.stdout + doctorResult.stderr).not.toContain("aidd sync");
    } finally {
      await env.cleanup();
    }
  });
});

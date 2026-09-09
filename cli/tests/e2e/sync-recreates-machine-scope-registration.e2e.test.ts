import { cp, readFile, realpath, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const FRAMEWORK_REAL_PATH = resolve(process.cwd(), "tests/fixtures/framework-real");

/**
 * A clone never carries what its own `.gitignore` excludes — `.aidd/cache/` chief among them
 * — so stripping it is what makes `projectDir` a faithful stand-in for a fresh `git clone`.
 */
async function cloneProjectWithoutCache(sourceDir: string, destDir: string): Promise<void> {
  await cp(sourceDir, destDir, { recursive: true });
  await rm(join(destDir, ".aidd", "cache"), { recursive: true, force: true });
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
}

describe("E2E: sync recreates a machine-scope registration a fresh clone never carried", () => {
  it("registers the shared source and this project's own reference, with native activation unavailable", async () => {
    const origin = await createTestEnv("machine-scope-sync-origin");
    const clone = await createTestEnv("machine-scope-sync-clone");
    try {
      // The machine that first ran `setup`: registers the shared source under its own
      // user config dir, and writes the committed project files a clone will carry.
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
        origin.projectDir,
        origin.fakeHome
      );
      expect(setupResult.exitCode).toBe(0);

      // A second machine checking out the same project for the first time: its own user
      // config dir has never run `setup`, so `marketplaces.json` does not exist there.
      await cloneProjectWithoutCache(origin.projectDir, clone.projectDir);

      const syncResult = await runCli(["sync"], clone.projectDir, clone.fakeHome);

      expect(syncResult.exitCode).toBe(0);
      // Native activation genuinely could not run in this sandbox (no drivable tool binary
      // on PATH), so the marketplace is registered but the plugin will not load yet.
      expect(syncResult.stderr).toContain(
        "claude: the plugin will not load until the claude CLI has run."
      );

      const marketplaces = await readJson(
        join(clone.fakeHome, ".config", "aidd", "marketplaces.json")
      );
      const names = (marketplaces.marketplaces as Array<{ name: string }>).map((m) => m.name);
      expect(names).toContain("aidd-framework");

      const references = await readJson(join(clone.fakeHome, ".config", "aidd", "references.json"));
      const allProjectRoots = Object.values(references).flat() as string[];
      const expectedRoot = await realpath(clone.projectDir);
      expect(allProjectRoots).toContain(expectedRoot);
    } finally {
      await origin.cleanup();
      await clone.cleanup();
    }
  });

  it("a second project's own setup on a machine that already registered the source adds its own reference, never replacing the first", async () => {
    const first = await createTestEnv("machine-scope-shared-home-first");
    const second = await createTestEnv("machine-scope-shared-home-second");
    try {
      // Both projects share one machine — one `fakeHome`, never `second.fakeHome` — so the
      // second `setup` finds the source registered, and must count two claims, not replace one.
      const firstSetup = await runCli(
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
        first.projectDir,
        first.fakeHome
      );
      expect(firstSetup.exitCode).toBe(0);

      const secondSetup = await runCli(
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
        second.projectDir,
        first.fakeHome
      );
      expect(secondSetup.exitCode).toBe(0);

      const references = await readJson(join(first.fakeHome, ".config", "aidd", "references.json"));
      const allProjectRoots = Object.values(references).flat() as string[];
      const firstRoot = await realpath(first.projectDir);
      const secondRoot = await realpath(second.projectDir);
      expect(allProjectRoots).toContain(firstRoot);
      expect(allProjectRoots).toContain(secondRoot);
      expect(allProjectRoots).toHaveLength(2);
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });
});

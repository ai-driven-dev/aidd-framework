import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const AIDD_DIR = ".aidd";
const MARKETPLACE = "aidd-e2e-cache-mkt";

/** As if a previous run, on a machine carrying `claude` on PATH, had recorded a native
 * registration: this sandbox never puts a real host binary on PATH to produce one. */
async function seedManifestWithClaudeNativeRegistrations(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, AIDD_DIR), { recursive: true });
  await writeFile(
    join(projectDir, AIDD_DIR, "manifest.json"),
    JSON.stringify({
      version: 8,
      tools: {
        claude: {
          toolId: "claude",
          version: "1.0.0",
          files: [],
          nativeRegistrations: {
            binary: "claude",
            marketplaces: [{ alias: MARKETPLACE, hostName: MARKETPLACE }],
            pluginRefs: [],
          },
        },
      },
    }),
    "utf-8"
  );
}

describe.concurrent("E2E: aidd clean and a host's own plugin cache", () => {
  it("leaves a seeded claude cache tree in place when the claude CLI is not on PATH", async () => {
    // This sandbox's own PATH never carries a real `claude`, so this proves the
    // binary-absent branch alone, never that the purge runs against a real one.
    const { projectDir, fakeHome, cleanup } = await createTestEnv("clean-cache-binary-missing");
    try {
      await seedManifestWithClaudeNativeRegistrations(projectDir);
      const cacheDir = join(fakeHome, ".claude", "plugins", "cache", MARKETPLACE, "plugin-a");
      await mkdir(cacheDir, { recursive: true });
      const cacheFile = join(cacheDir, "plugin.json");
      await writeFile(cacheFile, "{}", "utf-8");

      const { exitCode } = await runCli(["clean", "--force"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(existsSync(cacheFile)).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const AIDD_DIR = ".aidd";
const MARKETPLACE = "aidd-e2e-cache-mkt";

/**
 * A manifest as if a *previous* run, on a machine where `claude` was on PATH, had
 * already recorded a native registration for it — the only way to reach
 * `undoNativeRegistrations`'s own binary-availability branch from this sandbox, which
 * never puts a real host binary on PATH (`sandbox-reaches-no-tool-binary.e2e.test.ts`).
 * A fresh `setup`/`sync` run here would never populate `nativeRegistrations` at all,
 * since recording one requires the activation that produced it to have actually run.
 */
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
    // This sandbox's own PATH never carries a real `claude` (see
    // sandbox-reaches-no-tool-binary.e2e.test.ts), so this proves exactly the
    // binary-absent branch: with nothing to call, `clean` never even purges the cache
    // path claude's own profile declares. It is not, and cannot be, a proof that the
    // purge itself runs against a real `claude` — that is `smoke-real.sh`'s job.
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

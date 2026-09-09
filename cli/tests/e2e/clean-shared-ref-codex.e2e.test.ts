/**
 * Codex enables a plugin machine-wide (no `NativeActivation.scopeArgs`), so a `clean` here
 * must not disable it. `--plugins none` records no `pluginRefs`, so a real name is passed.
 */
import { readFile, realpath } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, pathWithoutAidd, runCli, writeFakeToolBinary } from "./helpers.js";

const FRAMEWORK_REAL_PATH = resolve(process.cwd(), "tests/fixtures/framework-real");
const PLUGIN_NAME = "aidd-vcs";

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
}

describe("E2E: clean leaves a codex ref enabled while another project still shares it", () => {
  it("keeps the plugin's ref enabled, names the other project, and never calls plugin remove", async () => {
    const first = await createTestEnv("clean-shared-ref-codex-first");
    const second = await createTestEnv("clean-shared-ref-codex-second");
    try {
      const logFile = join(first.tempDir, "codex-invocations.log");
      const binDir = join(first.tempDir, "bin");
      await writeFakeToolBinary(binDir, "codex", logFile);
      const env = { PATH: `${binDir}${delimiter}${pathWithoutAidd()}` };

      const setupArgs = [
        "setup",
        "--source",
        "local",
        "--path",
        FRAMEWORK_REAL_PATH,
        "--ai",
        "codex",
        "--plugins",
        PLUGIN_NAME,
        "--yes",
      ];

      // Both projects share one machine: one `fakeHome` (`first.fakeHome`), never
      // `second.fakeHome`.
      const firstSetup = await runCli(setupArgs, first.projectDir, first.fakeHome, { env });
      expect(firstSetup.exitCode).toBe(0);
      const secondSetup = await runCli(setupArgs, second.projectDir, first.fakeHome, { env });
      expect(secondSetup.exitCode).toBe(0);

      const secondRoot = await realpath(second.projectDir);
      const referencesBefore = await readJson(
        join(first.fakeHome, ".config", "aidd", "references.json")
      );
      expect(Object.values(referencesBefore).flat()).toContain(secondRoot);

      const cleanResult = await runCli(["clean", "--force"], first.projectDir, first.fakeHome, {
        env,
      });

      expect(cleanResult.exitCode).toBe(0);
      expect(cleanResult.stderr).toContain("left enabled");
      expect(cleanResult.stderr).toContain(secondRoot);

      const log = await readFile(logFile, "utf-8");
      expect(log).not.toContain("plugin remove");

      // Second project's own claim survives this project's own clean — it never ran
      // `clean` itself, and the guard is exactly what keeps its plugin loaded too.
      const referencesAfter = await readJson(
        join(first.fakeHome, ".config", "aidd", "references.json")
      );
      expect(Object.values(referencesAfter).flat()).toContain(secondRoot);
      const firstRoot = await realpath(first.projectDir);
      expect(Object.values(referencesAfter).flat()).not.toContain(firstRoot);
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });
});

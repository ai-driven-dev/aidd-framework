/**
 * `clean` in one project must not disable a plugin another project on the same
 * machine still needs — the fix `clean-shared-ref-guard.integration.test.ts` proves
 * against substituted ports, run here once against the real built binary.
 *
 * Two motifs combined: the fake host binary that logs its own invocations
 * (`marketplace-add-conflict.e2e.test.ts`) and one `fakeHome` shared by two projects
 * (`sync-recreates-machine-scope-registration.e2e.test.ts`). Codex declares no
 * `NativeActivation.scopeArgs` at all, so it enables a plugin machine-wide — exactly
 * the case this guard exists for.
 *
 * `--plugins none`, which every other e2e fixture passes, records no
 * `NativeRegistrations.pluginRefs` at all (nothing was ever asked to install), so this
 * suite passes a real plugin name instead — confirmed by a throwaway probe against
 * the real built binary before this file was written: `setup --ai codex --plugins
 * aidd-vcs` against a fake codex binary populates the project's own
 * `nativeRegistrations.codex.pluginRefs` with `aidd-vcs@aidd-framework`, which is what
 * this guard needs to have anything to guard.
 */
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, pathWithoutAidd, runCli } from "./helpers.js";

const FRAMEWORK_REAL_PATH = resolve(process.cwd(), "tests/fixtures/framework-real");
const PLUGIN_NAME = "aidd-vcs";

async function writeFakeCodexBinary(binDir: string, logFile: string): Promise<void> {
  await mkdir(binDir, { recursive: true });
  await writeFile(join(binDir, "codex"), `#!/bin/sh\necho "$@" >> "${logFile}"\nexit 0\n`, {
    mode: 0o755,
  });
}

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
      await writeFakeCodexBinary(binDir, logFile);
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
      // `second.fakeHome` — the same pattern
      // `sync-recreates-machine-scope-registration.e2e.test.ts` uses for two projects
      // on one machine-scope registration.
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

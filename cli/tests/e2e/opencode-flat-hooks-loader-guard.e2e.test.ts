/** OpenCode's own plugin loader imports every file one level under `.opencode/plugin/`
 * in-process, so a script calling `process.exit` there kills the host uncatchably. */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createTestEnv, FRAMEWORK_PATH, runCli } from "./helpers.js";

const execFileAsync = promisify(execFile);

// A `process.exit` at module scope, no export: OpenCode's loader catches a thrown error,
// never a process exit.
const HOSTILE_SCRIPT = "(() => {\n  process.exit(1);\n})();\n";

// A well-formed OpenCode plugin module: a function export, nothing else.
const BENIGN_PLUGIN_SCRIPT = "export const OpencodePlugin = async () => ({});\n";

// Imports its one argument as a module in THIS process, under a non-empty `process.argv` —
// the same shape a real host provides, inherited by what the import evaluates.
const IMPORT_HARNESS =
  'import(process.argv[2]).then(() => { console.log("HOST ALIVE"); process.exit(0); })' +
  ".catch((err) => { console.error(String(err)); process.exit(1); });\n";

async function importSurvives(
  harnessPath: string,
  modulePath: string
): Promise<{ exitCode: number; stdout: string }> {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [harnessPath, pathToFileURL(modulePath).href, "some-non-empty-argv"],
      { timeout: 5000 }
    );
    return { exitCode: 0, stdout };
  } catch (error) {
    const err = error as { stdout?: string; code?: number };
    return { exitCode: err.code ?? 1, stdout: err.stdout ?? "" };
  }
}

describe("opencode flat build — nothing hostile lands where the loader imports it", () => {
  it("relocates a hook script out of .opencode/plugin/; whatever remains survives import with a live argv", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("oc-hooks-guard");
    try {
      const sourceDir = join(tempDir, "source");
      await cp(FRAMEWORK_PATH, sourceDir, { recursive: true });

      const hooksDir = join(sourceDir, "plugins", "aidd-test", "hooks");
      await writeFile(join(hooksDir, "hostile.js"), HOSTILE_SCRIPT, "utf-8");
      await writeFile(join(hooksDir, "opencode-plugin.js"), BENIGN_PLUGIN_SCRIPT, "utf-8");

      const harnessPath = join(tempDir, "import-harness.mjs");
      await writeFile(harnessPath, IMPORT_HARNESS, "utf-8");

      const outDir = join(tempDir, "dist");
      await mkdir(outDir, { recursive: true });
      const build = await runCli(
        ["translate", sourceDir, "--to", "opencode", "--as", "flat", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(build.exitCode).toBe(0);

      // (a) namespaced under .opencode/hooks/<plugin>/, never under .opencode/plugin/.
      expect(existsSync(join(outDir, ".opencode", "hooks", "aidd-test", "hostile.js"))).toBe(true);
      expect(existsSync(join(outDir, ".opencode", "plugin", "hostile.js"))).toBe(false);

      // (b) exactly the renamed loader entry remains — not zero files, which would make the
      // import loop below pass over nothing — and it survives import with a live argv.
      const pluginDir = join(outDir, ".opencode", "plugin");
      const remaining = existsSync(pluginDir) ? await readdir(pluginDir) : [];
      expect(remaining).toEqual(["aidd-test.js"]);

      for (const name of remaining) {
        const result = await importSurvives(harnessPath, join(pluginDir, name));
        expect(result.stdout, name).toContain("HOST ALIVE");
        expect(result.exitCode, name).toBe(0);
      }
    } finally {
      await cleanup();
    }
  });
});

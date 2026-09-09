/**
 * The bridge is only observable in a real translate output tree. The fixture plugin is
 * extended in a private copy of the source, never in the checked-in one other suites share.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createTestEnv, FRAMEWORK_PATH, runCli } from "./helpers.js";

const execFileAsync = promisify(execFile);

const STOP_SCRIPT = 'require("node:fs").writeFileSync("marker.txt", "spawned");\n';

// Concatenated, since biome reads a plain string holding "${...}" as a forgotten template
// literal.
const ROOT = "$" + "{CLAUDE_PLUGIN_ROOT}";

const IMPORT_ONLY_HARNESS =
  'import(process.argv[2]).then(() => { console.log("HOST ALIVE"); process.exit(0); })' +
  ".catch((err) => { console.error(String(err)); process.exit(1); });\n";

async function waitForFile(path: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return existsSync(path);
}

describe("opencode's generated event bridge, against the real build", () => {
  it("imports safely with a live argv, spawns nothing on import, and spawns the Stop script on session.idle", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("oc-hooks-bridge");
    try {
      const sourceDir = join(tempDir, "source");
      await cp(FRAMEWORK_PATH, sourceDir, { recursive: true });

      const hooksDir = join(sourceDir, "plugins", "aidd-test", "hooks");
      await writeFile(join(hooksDir, "marker.js"), STOP_SCRIPT, "utf-8");
      await writeFile(
        join(hooksDir, "hooks.json"),
        JSON.stringify({
          hooks: {
            PreToolUse: [{ hooks: [{ type: "command", command: `${ROOT}/hooks/check.sh` }] }],
            Stop: [{ hooks: [{ type: "command", command: `node ${ROOT}/hooks/marker.js` }] }],
          },
        }),
        "utf-8"
      );

      const outDir = join(tempDir, "dist");
      await mkdir(outDir, { recursive: true });
      const build = await runCli(
        ["translate", sourceDir, "--to", "opencode", "--as", "flat", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(build.exitCode).toBe(0);

      const bridgePath = join(outDir, ".opencode", "plugin", "aidd-test-hooks.js");
      expect(existsSync(bridgePath)).toBe(true);

      // A live, non-empty argv is the shape a real host provides.
      const harnessPath = join(tempDir, "import-only.mjs");
      await writeFile(harnessPath, IMPORT_ONLY_HARNESS, "utf-8");
      const { stdout } = await execFileAsync(
        process.execPath,
        [harnessPath, pathToFileURL(bridgePath).href, "some-non-empty-argv"],
        { cwd: outDir, timeout: 5000 }
      );
      expect(stdout).toContain("HOST ALIVE");
      expect(existsSync(join(outDir, "marker.txt"))).toBe(false);

      // Driven in its own child, so the marker file lands relative to a cwd this test
      // controls.
      const driverPath = join(tempDir, "drive-session-idle.mjs");
      await writeFile(
        driverPath,
        `const mod = await import(${JSON.stringify(pathToFileURL(bridgePath).href)});
         const factories = Object.keys(mod).filter((k) => typeof mod[k] === "function");
         const hooks = await mod[factories[0]]({ directory: process.argv[2] });
         await hooks.event({ event: { type: "session.idle", properties: { sessionID: "s1" } } });
        `,
        "utf-8"
      );
      await execFileAsync(process.execPath, [driverPath, outDir], { timeout: 5000 });

      const markerWritten = await waitForFile(join(outDir, "marker.txt"), 4000);
      expect(markerWritten).toBe(true);
      expect(await readFile(join(outDir, "marker.txt"), "utf-8")).toBe("spawned");
    } finally {
      await cleanup();
    }
  });
});

import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createTestEnv, gitInit, gitSetOriginRemote, runCli } from "./helpers.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(process.cwd(), "..");
const PLUGIN_SOURCE = join(REPO_ROOT, "plugins", "aidd-telemetry");
const SESSION_FIXTURE = join(
  REPO_ROOT,
  "scripts",
  "__tests__",
  "fixtures",
  "claude-code-session-start.json"
);

// Every other test runs the journal hook from the source tree. Installation moves it, and
// a move that drops hooks/lib/ leaves a hook that throws on its first require — silently,
// since a hook that fails is a hook that never records. Only running the installed copy
// catches that.
describe("E2E: the journal hook runs from where installation puts it", () => {
  it("records a session through the installed plugin, not the source tree", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-hook-install");
    try {
      await gitInit(projectDir);
      await gitSetOriginRemote(projectDir, "git@github.com:aidd-lab/hook-install.git");
      expect((await runCli(["ai", "install", "claude"], projectDir, fakeHome)).exitCode).toBe(0);
      expect(
        (await runCli(["plugin", "install", PLUGIN_SOURCE, "--yes"], projectDir, fakeHome)).exitCode
      ).toBe(0);

      await mkdir(join(projectDir, ".aidd"), { recursive: true });
      await writeFile(
        join(projectDir, ".aidd", "config.json"),
        JSON.stringify({ telemetry: { enabled: true, endpoint: "http://127.0.0.1:4318" } })
      );

      const payload = JSON.parse(readFileSync(SESSION_FIXTURE, "utf-8"));
      payload.cwd = projectDir;
      payload.session_id = "9f1c2d34-aaaa-4bbb-8ccc-0000000000e2";

      const hookPath = join(
        projectDir,
        ".claude",
        "plugins",
        "aidd-telemetry",
        "hooks",
        "journal.js"
      );
      const hook = execFileAsync(process.execPath, [hookPath, "session-start"]);
      hook.child.stdin?.end(JSON.stringify(payload));
      const { stderr } = await hook;
      expect(stderr).toBe("");

      const written = readdirSync(join(projectDir, "aidd_docs", "runs"));
      expect(written).toHaveLength(1);
      expect(written[0]).toMatch(/\.jsonl$/);
      const lines = readFileSync(
        join(projectDir, "aidd_docs", "runs", written[0] as string),
        "utf-8"
      )
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));
      expect(lines).toHaveLength(1);
      const sessionStart = lines[0];
      expect(sessionStart.type).toBe("session_start");
      expect(sessionStart.schema_version).toBe(2);
      expect(sessionStart.project_id).toBe("aidd-lab/hook-install");
      expect(sessionStart.project_remote).toBe("git@github.com:aidd-lab/hook-install.git");
      expect(sessionStart.vendor_id).toBe(payload.session_id);
    } finally {
      await cleanup();
    }
  });
});

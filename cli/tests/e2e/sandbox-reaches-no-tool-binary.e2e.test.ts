import { execFile } from "node:child_process";
import { delimiter } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createTestEnv, sandboxedEnv } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** A test's result must not depend on which AI tools the runner happens to have installed —
 * the OpenCode reader shells out to a binary and waits ten seconds for it. */
// AI tools only: `gh` is the CLI's own auth dependency, the same standing as `git` and `node`
// below, and a runner shipping it is the normal case, not a deviation.
const TOOL_BINARIES = ["opencode", "claude", "codex", "copilot", "cursor-agent"] as const;

async function whichUnderSandbox(binary: string, cwd: string, env: NodeJS.ProcessEnv) {
  const finder = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(finder, [binary], { cwd, env });
    return stdout.trim();
  } catch {
    return "";
  }
}

describe("E2E: the sandbox a test spawns into", () => {
  it("reaches no AI tool binary, whatever the runner has installed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("sandbox-path-");
    try {
      const env = sandboxedEnv(fakeHome);
      const reachable: string[] = [];

      for (const binary of TOOL_BINARIES) {
        const found = await whichUnderSandbox(binary, projectDir, env);
        if (found) reachable.push(`${binary} -> ${found}`);
      }

      expect(reachable).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("still reaches node and git, which the code under test genuinely needs", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("sandbox-path-keeps-");
    try {
      const env = sandboxedEnv(fakeHome);

      // `hooks/lib/repo.cjs` shells out to git, and every spawned command is node itself.
      // A sandbox that reached neither would make this guard pass by breaking everything.
      expect(await whichUnderSandbox("git", projectDir, env)).not.toBe("");
      expect(await whichUnderSandbox("node", projectDir, env)).not.toBe("");
    } finally {
      await cleanup();
    }
  });

  it("sets a PATH of its own rather than inheriting the runner's", async () => {
    const { fakeHome, cleanup } = await createTestEnv("sandbox-path-own-");
    try {
      const env = sandboxedEnv(fakeHome);
      const sandboxed = (env.PATH ?? "").split(delimiter).filter(Boolean);

      expect(sandboxed.length).toBeGreaterThan(0);
      // Narrower than the runner's own, on any machine that has more than node and git.
      expect(sandboxed.length).toBeLessThanOrEqual(
        (process.env.PATH ?? "").split(delimiter).filter(Boolean).length
      );
    } finally {
      await cleanup();
    }
  });
});

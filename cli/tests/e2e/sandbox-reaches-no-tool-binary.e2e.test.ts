import { execFile } from "node:child_process";
import { delimiter } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createTestEnv, sandboxedEnv } from "./helpers.js";

const execFileAsync = promisify(execFile);

/**
 * What a spawned `aidd` can reach decides what a test measures.
 *
 * The OpenCode reader shells out to an `opencode` binary and waits up to ten seconds for it.
 * While `sandboxedEnv` inherited the runner's own `PATH`, a machine with that tool installed
 * paid a cost a machine without it did not — and `records stored before opting in stay
 * unnamed` swung between 14 seconds and a 60-second timeout across three runs with no code
 * change at all. Pinning the sandbox's `PATH` took that file from 13.9s to a steady 5.1s.
 *
 * This is the guard on that, rather than on the symptom: a test's result must not depend on
 * which AI tools the person running it happens to have installed.
 */
/**
 * AI tools only. `gh` deliberately absent: it is not a tool whose files anything here reads,
 * it is the CLI's own auth dependency (`gh-cli-adapter.ts` spawns `gh auth token`), the same
 * standing as `git` and `node` below. Listing it made this guard fail on any runner that
 * ships GitHub CLI at `/usr/bin/gh` — measured on `cli / Test`, where a machine having `gh`
 * is the normal case, not the deviation this test exists to catch.
 */
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

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, FRAMEWORK_PATH, runCli } from "./helpers.js";

const MODIFIED = '{"MODIFIED":true}';

/** A setup that installs one tool, so the manifest tracks something `sync` can repair. */
async function installClaude(projectDir: string, fakeHome: string): Promise<void> {
  const setup = ["setup", "--source", "local", "--path", FRAMEWORK_PATH];
  await runCli([...setup, "--ai", "claude", "--plugins", "none", "--yes"], projectDir, fakeHome);
}

/** The first regular file the Claude install tracked, as the manifest records it. */
async function firstTrackedFile(projectDir: string): Promise<string> {
  const raw = await readFile(join(projectDir, ".aidd", "manifest.json"), "utf-8");
  const manifest = JSON.parse(raw) as {
    tools: Record<string, { files: Array<{ relativePath: string }> }>;
  };
  const relativePath = manifest.tools.claude?.files[0]?.relativePath;
  if (relativePath === undefined) throw new Error("no tracked file to modify");
  return relativePath;
}

async function installAndModify(
  projectDir: string,
  fakeHome: string
): Promise<{ tracked: string; installed: string }> {
  await installClaude(projectDir, fakeHome);
  const tracked = await firstTrackedFile(projectDir);
  const installed = await readFile(join(projectDir, tracked), "utf-8");
  await writeFile(join(projectDir, tracked), MODIFIED, "utf-8");
  return { tracked, installed };
}

describe.concurrent("E2E: aidd sync --force", () => {
  it("repairs a modified tracked file instead of reporting nothing to restore", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("sync-force-modified");
    try {
      const { tracked, installed } = await installAndModify(projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["sync", "--force"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout).not.toContain("Nothing to restore");
      expect(stdout).toContain("Restored 1 file");
      expect(await readFile(join(projectDir, tracked), "utf-8")).toBe(installed);
    } finally {
      await cleanup();
    }
  });

  it("without --force and without a TTY, fails loudly instead of claiming success", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("sync-no-force-modified");
    try {
      const { tracked } = await installAndModify(projectDir, fakeHome);

      const { stdout, stderr, exitCode } = await runCli(["sync"], projectDir, fakeHome);

      expect(exitCode).not.toBe(0);
      expect(stdout).not.toContain("Nothing to restore");
      expect(`${stdout}${stderr}`).toContain("--force");
      // It refused, so it must not have touched the file either.
      expect(await readFile(join(projectDir, tracked), "utf-8")).toBe(MODIFIED);
    } finally {
      await cleanup();
    }
  });

  it("still reports nothing to restore when nothing drifted", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("sync-force-clean");
    try {
      await installClaude(projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["sync", "--force"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Nothing to restore");
    } finally {
      await cleanup();
    }
  });

  /**
   * The sandbox this suite runs in reaches no real `claude` binary
   * (`sandbox-reaches-no-tool-binary.e2e.test.ts` holds that boundary), so this is the one
   * case a real built-binary run of `sync` can prove: the binary-missing path. `sync` now
   * drives native activation the same way `setup` does (lot 2) — this proves it actually
   * runs from the real command, not only from the use case's own tests, and that the exit
   * code stays 0: restoration succeeded, and an absent binary is a fact, not a failure.
   */
  it("warns that the plugin will not load until the claude CLI has run, and still exits 0", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("sync-force-native-activation");
    try {
      await installClaude(projectDir, fakeHome);

      const { stderr, exitCode } = await runCli(["sync", "--force"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stderr).toContain("claude: the plugin will not load until the claude CLI has run.");
    } finally {
      await cleanup();
    }
  });
});

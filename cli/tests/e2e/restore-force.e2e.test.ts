import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const MODIFIED = '{"MODIFIED":true}';

async function seedManifest(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, ".aidd"), { recursive: true });
  await writeFile(
    join(projectDir, ".aidd", "manifest.json"),
    JSON.stringify({ version: 5, tools: {}, marketplaces: {} }),
    "utf-8"
  );
}

/** The first regular file `ai install claude` tracked, as the manifest records it. */
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
  await seedManifest(projectDir);
  await runCli(["ai", "install", "claude"], projectDir, fakeHome);
  const tracked = await firstTrackedFile(projectDir);
  const installed = await readFile(join(projectDir, tracked), "utf-8");
  await writeFile(join(projectDir, tracked), MODIFIED, "utf-8");
  return { tracked, installed };
}

describe.concurrent("E2E: aidd restore --force", () => {
  it("repairs a modified tracked file instead of reporting nothing to restore", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("restore-force-modified");
    try {
      const { tracked, installed } = await installAndModify(projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["restore", "--force"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout).not.toContain("Nothing to restore");
      expect(stdout).toContain("Restored 1 file");
      expect(await readFile(join(projectDir, tracked), "utf-8")).toBe(installed);
    } finally {
      await cleanup();
    }
  });

  it("without --force and without a TTY, fails loudly instead of claiming success", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("restore-no-force-modified");
    try {
      const { tracked } = await installAndModify(projectDir, fakeHome);

      const { stdout, stderr, exitCode } = await runCli(["restore"], projectDir, fakeHome);

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
    const { projectDir, fakeHome, cleanup } = await createTestEnv("restore-force-clean");
    try {
      await seedManifest(projectDir);
      await runCli(["ai", "install", "claude"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["restore", "--force"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Nothing to restore");
    } finally {
      await cleanup();
    }
  });
});

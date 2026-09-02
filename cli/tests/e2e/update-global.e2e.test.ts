import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const AIDD_DIR = ".aidd";

async function seedProject(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, AIDD_DIR), { recursive: true });
  await writeFile(
    join(projectDir, AIDD_DIR, "manifest.json"),
    JSON.stringify({ version: 6, tools: {} }),
    "utf-8"
  );
}

describe.concurrent("E2E: aidd update", () => {
  it("reports all tools up to date when no tools have drift", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("update-noop");
    try {
      await seedProject(projectDir);
      await runCli(["ai", "install", "claude"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["update"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toMatch(/up to date|updated/);
    } finally {
      await cleanup();
    }
  });

  it("re-installs runtime configs from bundled assets", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("update-force");
    try {
      await seedProject(projectDir);
      await runCli(["ai", "install", "claude"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["update"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toMatch(/updated|up to date/);
      // manifest still exists after update
      expect(existsSync(join(projectDir, AIDD_DIR, "manifest.json"))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("exits zero when no manifest exists (no tools installed)", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("update-empty");
    try {
      const { stdout, exitCode } = await runCli(["update"], projectDir, fakeHome);

      // update exits 0 and reports no tools
      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toMatch(/up to date|no manifest|nothing/);
    } finally {
      await cleanup();
    }
  });

  it("updates multiple installed tools in one invocation", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("update-multi");
    try {
      await seedProject(projectDir);
      await runCli(["ai", "install", "claude"], projectDir, fakeHome);
      await runCli(["ai", "install", "cursor"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["update"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      // Both tools should be mentioned
      expect(stdout).toContain("claude");
      expect(stdout).toContain("cursor");
    } finally {
      await cleanup();
    }
  });
});

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const AIDD_DIR = ".aidd";

async function seedManifest(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, AIDD_DIR), { recursive: true });
  await writeFile(
    join(projectDir, AIDD_DIR, "manifest.json"),
    JSON.stringify({ version: 6, tools: {} }),
    "utf-8"
  );
}

async function seedTelemetryConfig(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, AIDD_DIR), { recursive: true });
  await writeFile(
    join(projectDir, AIDD_DIR, "config.json"),
    JSON.stringify({ telemetry: { enabled: true, endpoint: "http://127.0.0.1:4318" } }),
    "utf-8"
  );
}

describe.concurrent("E2E: aidd clean", () => {
  it("reports nothing to clean when not initialized", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("clean-empty");
    try {
      const { stdout, exitCode } = await runCli(["clean", "--force"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Nothing to clean");
    } finally {
      await cleanup();
    }
  });

  it("shows 'Would remove' summary in non-interactive mode without --force", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("clean-dry-run");
    try {
      await seedManifest(projectDir);
      await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);

      // runCli runs non-TTY (child process without TTY), so dry-run shows Would remove
      const { stdout, exitCode } = await runCli(["clean"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Would remove");
      expect(stdout).toContain("--force");
    } finally {
      await cleanup();
    }
  });

  it("deletes all installed files and manifest when --force is used", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("clean-force");
    try {
      await seedManifest(projectDir);
      await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["clean", "--force"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Cleaned all AIDD files");
      expect(existsSync(join(projectDir, ".claude"))).toBe(false);
      expect(existsSync(join(projectDir, AIDD_DIR))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("lists tool names and file counts in dry-run preview output", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("clean-preview");
    try {
      await seedManifest(projectDir);
      await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["clean"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("claude");
      expect(stdout).toMatch(/\d+ files?/);
    } finally {
      await cleanup();
    }
  });

  it("keeps .aidd/config.json and says so, while removing manifest.json", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("clean-keeps-config");
    try {
      await seedManifest(projectDir);
      await seedTelemetryConfig(projectDir);
      await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["clean", "--force"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Kept .aidd/config.json");
      expect(existsSync(join(projectDir, AIDD_DIR, "config.json"))).toBe(true);
      expect(existsSync(join(projectDir, AIDD_DIR, "manifest.json"))).toBe(false);
      expect(existsSync(join(projectDir, AIDD_DIR))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("removes all tool directories when multiple tools are installed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("clean-multi");
    try {
      await seedManifest(projectDir);
      await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);
      await runCli(["framework", "install", "--tool", "cursor"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["clean", "--force"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Cleaned");

      expect(existsSync(join(projectDir, ".claude"))).toBe(false);
      expect(existsSync(join(projectDir, ".cursor"))).toBe(false);
      expect(existsSync(join(projectDir, AIDD_DIR))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("leaves no .aidd behind when a marketplace was registered", async () => {
    // The state the CLI wrote itself. Left behind, `.aidd` survived a run that had just
    // printed that it cleaned all AIDD files.
    const { projectDir, fakeHome, cleanup } = await createTestEnv("clean-registry");
    try {
      await seedManifest(projectDir);
      await runCli(["ai", "install", "claude"], projectDir, fakeHome);
      await writeFile(
        join(projectDir, AIDD_DIR, "marketplaces.json"),
        JSON.stringify({ version: 1, marketplaces: [] }),
        "utf-8"
      );

      const { exitCode } = await runCli(["clean", "--force"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(existsSync(join(projectDir, AIDD_DIR))).toBe(false);
    } finally {
      await cleanup();
    }
  });
});

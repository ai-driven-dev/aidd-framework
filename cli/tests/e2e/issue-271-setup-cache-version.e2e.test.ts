import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const FRAMEWORK_REAL_PATH = resolve(process.cwd(), "tests/fixtures/framework-real");
const AIDD_DIR = ".aidd";

async function seedManifest(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, AIDD_DIR), { recursive: true });
  await writeFile(
    join(projectDir, AIDD_DIR, "manifest.json"),
    JSON.stringify({ version: 6, tools: {} }),
    "utf-8"
  );
}

async function readManifest(projectDir: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(projectDir, AIDD_DIR, "manifest.json"), "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe.concurrent("E2E: issue-271 — setup cache resolution and propagation version policy", () => {
  it("Scenario A: setup with local source and named plugin installs aidd-context under claude", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("271-scenario-a");
    try {
      await seedManifest(projectDir);

      const { exitCode, stderr } = await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          FRAMEWORK_REAL_PATH,
          "--ai",
          "claude",
          "--plugins",
          "aidd-context",
          "--yes",
        ],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stderr).not.toContain("local path does not exist");

      const manifest = await readManifest(projectDir);
      const tools = manifest.tools as Record<string, { plugins?: Array<{ name: string }> }>;
      const claudePlugins = tools.claude?.plugins ?? [];
      expect(claudePlugins.map((p) => p.name)).toContain("aidd-context");
    } finally {
      await cleanup();
    }
  });

  it("Scenario A (idempotent): re-running setup does not crash", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("271-scenario-a-idem");
    try {
      await seedManifest(projectDir);
      await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          FRAMEWORK_REAL_PATH,
          "--ai",
          "claude",
          "--plugins",
          "aidd-context",
          "--yes",
        ],
        projectDir,
        fakeHome
      );

      const { exitCode, stderr } = await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          FRAMEWORK_REAL_PATH,
          "--ai",
          "claude",
          "--plugins",
          "aidd-context",
          "--yes",
        ],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stderr).not.toContain("local path does not exist");
    } finally {
      await cleanup();
    }
  });

  it("Scenario B: propagation uses catalog version when manifest has drifted version", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("271-scenario-b");
    try {
      await seedManifest(projectDir);

      // Install claude with aidd-dev plugin from local fixture (catalog version 1.0.0)
      await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          FRAMEWORK_REAL_PATH,
          "--ai",
          "claude",
          "--plugins",
          "aidd-dev",
          "--yes",
        ],
        projectDir,
        fakeHome
      );

      // Drift the aidd-dev version in the manifest to simulate an older pinned version
      const manifestBefore = await readManifest(projectDir);
      const tools = manifestBefore.tools as Record<
        string,
        { plugins?: Array<{ name: string; version?: string }> }
      >;
      const claudePlugins = tools.claude?.plugins ?? [];
      for (const p of claudePlugins) {
        if (p.name === "aidd-dev") p.version = "0.9.0";
      }
      await writeFile(
        join(projectDir, AIDD_DIR, "manifest.json"),
        JSON.stringify(manifestBefore),
        "utf-8"
      );

      // Install cursor — this triggers plugin propagation with prefer-catalog policy
      const { exitCode, stdout, stderr } = await runCli(
        ["ai", "install", "cursor"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stderr).not.toContain("VersionMismatchError");
      expect(stderr).not.toContain("version mismatch");
      expect(stdout).toContain("aidd-dev");

      const manifestAfter = await readManifest(projectDir);
      const toolsAfter = manifestAfter.tools as Record<
        string,
        { plugins?: Array<{ name: string; version?: string }> }
      >;
      const cursorPlugins = toolsAfter.cursor?.plugins ?? [];
      const propagated = cursorPlugins.find((p) => p.name === "aidd-dev");
      expect(propagated).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it("Scenario C: strict mode (default) rejects version mismatch with VersionMismatchError", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("271-scenario-c");
    try {
      await seedManifest(projectDir);
      await runCli(["ai", "install", "claude"], projectDir, fakeHome);

      // Register local marketplace so aidd-dev is resolvable (catalog version 1.0.0)
      await runCli(
        ["marketplace", "add", "fixture-market", FRAMEWORK_REAL_PATH, "--yes"],
        projectDir,
        fakeHome
      );

      // plugin install aidd-dev@0.9.0 — catalog says 1.0.0, strict mode should reject
      const { exitCode, stderr } = await runCli(
        ["plugin", "install", "aidd-dev@0.9.0", "--tool", "claude"],
        projectDir,
        fakeHome
      );

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("does not match catalog version");
    } finally {
      await cleanup();
    }
  });
});

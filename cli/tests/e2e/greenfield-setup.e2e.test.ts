import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const AIDD_DIR = ".aidd";
const EMPTY_MANIFEST = { version: 7, tools: {} };

async function seedManifest(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, AIDD_DIR), { recursive: true });
  await writeFile(
    join(projectDir, AIDD_DIR, "manifest.json"),
    JSON.stringify(EMPTY_MANIFEST),
    "utf-8"
  );
}

describe.concurrent("E2E: aidd framework install --tool — individual tool install", () => {
  it("framework install --tool claude writes settings.json and manifest from bundled assets", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("greenfield-claude");
    try {
      await seedManifest(projectDir);

      const { stdout, exitCode } = await runCli(
        ["framework", "install", "--tool", "claude"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Installed claude");
      expect(existsSync(join(projectDir, ".claude", "settings.json"))).toBe(true);
      expect(existsSync(join(projectDir, AIDD_DIR, "manifest.json"))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("framework install --tool vscode writes .vscode/settings.json from bundled assets", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("greenfield-vscode");
    try {
      await seedManifest(projectDir);

      const { stdout, exitCode } = await runCli(
        ["framework", "install", "--tool", "vscode"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Installed vscode");
      expect(existsSync(join(projectDir, ".vscode", "settings.json"))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("framework install --tool cursor writes .cursor directory from bundled assets", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("greenfield-cursor");
    try {
      await seedManifest(projectDir);

      const { stdout, exitCode } = await runCli(
        ["framework", "install", "--tool", "cursor"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Installed cursor");
      expect(existsSync(join(projectDir, ".cursor"))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("framework install --tool claude is idempotent — second run warns already installed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("greenfield-install-idempotent");
    try {
      await seedManifest(projectDir);
      await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);

      const { stderr, exitCode } = await runCli(
        ["framework", "install", "--tool", "claude"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stderr).toContain("already installed");
    } finally {
      await cleanup();
    }
  });

  it("framework install --tool claude --force reinstalls over existing files", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("greenfield-force");
    try {
      await seedManifest(projectDir);
      await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(
        ["framework", "install", "--tool", "claude", "--force"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Installed claude");
    } finally {
      await cleanup();
    }
  });

  it("manifest tracks installed files after framework install --tool claude", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("greenfield-manifest");
    try {
      await seedManifest(projectDir);
      await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);

      const raw = await readFile(join(projectDir, AIDD_DIR, "manifest.json"), "utf-8");
      const manifest = JSON.parse(raw) as { tools: Record<string, unknown> };

      expect(manifest.tools).toHaveProperty("claude");
    } finally {
      await cleanup();
    }
  });

  it("framework install --tool copilot without vscode — no .vscode directory created", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("greenfield-copilot-no-vscode");
    try {
      await seedManifest(projectDir);

      const { exitCode } = await runCli(
        ["framework", "install", "--tool", "copilot"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(existsSync(join(projectDir, ".vscode"))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("framework install --tool copilot with vscode — .vscode/settings.json has copilot keys", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("greenfield-copilot-with-vscode");
    try {
      await seedManifest(projectDir);
      await runCli(["framework", "install", "--tool", "vscode"], projectDir, fakeHome);

      const { exitCode } = await runCli(
        ["framework", "install", "--tool", "copilot"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      const settingsPath = join(projectDir, ".vscode", "settings.json");
      expect(existsSync(settingsPath)).toBe(true);
      const content = await readFile(settingsPath, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      expect(parsed).toHaveProperty("github.copilot.enable");
      expect(parsed).toHaveProperty("editor.formatOnSave");
    } finally {
      await cleanup();
    }
  });
});

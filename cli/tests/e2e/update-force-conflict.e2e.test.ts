import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const AIDD_DIR = ".aidd";

async function seedProject(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, AIDD_DIR), { recursive: true });
  await writeFile(
    join(projectDir, AIDD_DIR, "manifest.json"),
    JSON.stringify({ version: 8, tools: {} }),
    "utf-8"
  );
}

async function installClaude(projectDir: string, fakeHome: string): Promise<void> {
  await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);
}

async function installVscode(projectDir: string, fakeHome: string): Promise<void> {
  await runCli(["framework", "install", "--tool", "vscode"], projectDir, fakeHome);
}

async function modifyFirstTrackedFile(projectDir: string, toolId: string): Promise<void> {
  const manifestPath = join(projectDir, AIDD_DIR, "manifest.json");
  const manifestRaw = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestRaw) as {
    version: number;
    tools: Record<string, { files: Array<{ relativePath: string }> }>;
  };
  const toolFiles = manifest.tools?.[toolId]?.files ?? [];
  const firstFile = toolFiles[0];
  if (!firstFile) throw new Error(`No ${toolId} files in manifest — install may have failed`);
  const filePath = join(projectDir, firstFile.relativePath);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, "user-modified content for conflict test");
}

async function modifyTrackedFile(projectDir: string): Promise<void> {
  return modifyFirstTrackedFile(projectDir, "claude");
}

// Bare `aidd update` is self-update and touches no tracked file, so the project-wide sweep
// under test is `framework update` without `--tool`.
describe.concurrent("E2E: update conflict guard", () => {
  describe("aidd framework update --tool claude", () => {
    it("exits 1 when a tracked AI tool file is modified in non-TTY mode (no --force)", async () => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv("update-guard-ai-exit1");
      try {
        await seedProject(projectDir);
        await installClaude(projectDir, fakeHome);
        await modifyTrackedFile(projectDir);

        const { exitCode, stderr } = await runCli(
          ["framework", "update", "--tool", "claude"],
          projectDir,
          fakeHome
        );

        expect(exitCode).toBe(1);
        expect(stderr.toLowerCase()).toMatch(/force|non-interactive/);
      } finally {
        await cleanup();
      }
    });

    it("exits 0 with --force when a tracked AI tool file is modified", async () => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv("update-guard-ai-force");
      try {
        await seedProject(projectDir);
        await installClaude(projectDir, fakeHome);
        await modifyTrackedFile(projectDir);

        const { exitCode } = await runCli(
          ["framework", "update", "--tool", "claude", "--force"],
          projectDir,
          fakeHome
        );

        expect(exitCode).toBe(0);
      } finally {
        await cleanup();
      }
    });

    it("exits 0 when all AI tool files are unmodified", async () => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv("update-guard-ai-unmod");
      try {
        await seedProject(projectDir);
        await installClaude(projectDir, fakeHome);

        const { exitCode } = await runCli(
          ["framework", "update", "--tool", "claude"],
          projectDir,
          fakeHome
        );

        expect(exitCode).toBe(0);
      } finally {
        await cleanup();
      }
    });
  });

  describe("aidd framework update --tool vscode", () => {
    it("exits 1 when a tracked IDE tool file is modified in non-TTY mode (no --force)", async () => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv("update-guard-ide-exit1");
      try {
        await seedProject(projectDir);
        await installVscode(projectDir, fakeHome);
        await modifyFirstTrackedFile(projectDir, "vscode");

        const { exitCode, stderr } = await runCli(
          ["framework", "update", "--tool", "vscode"],
          projectDir,
          fakeHome
        );

        expect(exitCode).toBe(1);
        expect(stderr.toLowerCase()).toMatch(/force|non-interactive/);
      } finally {
        await cleanup();
      }
    });

    it("exits 0 with --force when a tracked IDE tool file is modified", async () => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv("update-guard-ide-force");
      try {
        await seedProject(projectDir);
        await installVscode(projectDir, fakeHome);
        await modifyFirstTrackedFile(projectDir, "vscode");

        const { exitCode } = await runCli(
          ["framework", "update", "--tool", "vscode", "--force"],
          projectDir,
          fakeHome
        );

        expect(exitCode).toBe(0);
      } finally {
        await cleanup();
      }
    });

    it("exits 0 when all IDE tool files are unmodified", async () => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv("update-guard-ide-unmod");
      try {
        await seedProject(projectDir);
        await installVscode(projectDir, fakeHome);

        const { exitCode } = await runCli(
          ["framework", "update", "--tool", "vscode"],
          projectDir,
          fakeHome
        );

        expect(exitCode).toBe(0);
      } finally {
        await cleanup();
      }
    });
  });
});

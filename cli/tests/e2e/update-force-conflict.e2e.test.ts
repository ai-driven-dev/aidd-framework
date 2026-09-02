import { mkdir, readFile, writeFile } from "node:fs/promises";
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

async function installClaude(projectDir: string, fakeHome: string): Promise<void> {
  await runCli(["ai", "install", "claude"], projectDir, fakeHome);
}

async function installVscode(projectDir: string, fakeHome: string): Promise<void> {
  await runCli(["ide", "install", "vscode"], projectDir, fakeHome);
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

describe.concurrent("E2E: update conflict guard", () => {
  describe("aidd update (top-level)", () => {
    it("exits 1 when a tracked file is modified in non-TTY mode (no --force)", async () => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv("update-guard-all-exit1");
      try {
        await seedProject(projectDir);
        await installClaude(projectDir, fakeHome);
        await modifyTrackedFile(projectDir);

        const { exitCode, stderr } = await runCli(["update"], projectDir, fakeHome);

        expect(exitCode).toBe(1);
        expect(stderr.toLowerCase()).toMatch(/force|non-interactive/);
      } finally {
        await cleanup();
      }
    });

    it("exits 0 with --force when a tracked file is modified", async () => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv("update-guard-all-force");
      try {
        await seedProject(projectDir);
        await installClaude(projectDir, fakeHome);
        await modifyTrackedFile(projectDir);

        const { exitCode } = await runCli(["update", "--force"], projectDir, fakeHome);

        expect(exitCode).toBe(0);
      } finally {
        await cleanup();
      }
    });

    it("exits 0 when all files are unmodified (no prompt, no --force needed)", async () => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv("update-guard-all-unmod");
      try {
        await seedProject(projectDir);
        await installClaude(projectDir, fakeHome);

        const { exitCode } = await runCli(["update"], projectDir, fakeHome);

        expect(exitCode).toBe(0);
      } finally {
        await cleanup();
      }
    });
  });

  describe("aidd ai update", () => {
    it("exits 1 when a tracked AI tool file is modified in non-TTY mode (no --force)", async () => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv("update-guard-ai-exit1");
      try {
        await seedProject(projectDir);
        await installClaude(projectDir, fakeHome);
        await modifyTrackedFile(projectDir);

        const { exitCode, stderr } = await runCli(["ai", "update"], projectDir, fakeHome);

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

        const { exitCode } = await runCli(["ai", "update", "--force"], projectDir, fakeHome);

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

        const { exitCode } = await runCli(["ai", "update"], projectDir, fakeHome);

        expect(exitCode).toBe(0);
      } finally {
        await cleanup();
      }
    });
  });

  describe("aidd ide update", () => {
    it("exits 1 when a tracked IDE tool file is modified in non-TTY mode (no --force)", async () => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv("update-guard-ide-exit1");
      try {
        await seedProject(projectDir);
        await installVscode(projectDir, fakeHome);
        await modifyFirstTrackedFile(projectDir, "vscode");

        const { exitCode, stderr } = await runCli(["ide", "update"], projectDir, fakeHome);

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

        const { exitCode } = await runCli(["ide", "update", "--force"], projectDir, fakeHome);

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

        const { exitCode } = await runCli(["ide", "update"], projectDir, fakeHome);

        expect(exitCode).toBe(0);
      } finally {
        await cleanup();
      }
    });
  });
});

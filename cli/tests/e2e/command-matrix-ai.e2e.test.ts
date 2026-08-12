/**
 * Command Matrix E2E — AI & IDE tools surface
 * Automated counterpart of: aidd_docs/tasks/2026_05/2026_05_06-cli-v5-cleanup-command-matrix.md
 *
 * Already covered by existing E2E journeys (not duplicated here):
 *   greenfield-setup.e2e.test.ts — ai install claude/cursor (+ --force, idempotent),
 *                                  ide install vscode, manifest structure assertions
 *   sync-plugins.e2e.test.ts    — ai sync variants (missing source, noop, agent, force)
 *
 * See also: command-matrix-help.e2e.test.ts, command-matrix-plugin.e2e.test.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const AIDD_DIR = ".aidd";
const EMPTY_MANIFEST = { version: 5, tools: {}, marketplaces: {} };

async function seedManifest(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, AIDD_DIR), { recursive: true });
  await writeFile(
    join(projectDir, AIDD_DIR, "manifest.json"),
    JSON.stringify(EMPTY_MANIFEST),
    "utf-8"
  );
}

async function seedWithClaude(projectDir: string, fakeHome: string): Promise<void> {
  await seedManifest(projectDir);
  await runCli(["ai", "install", "claude"], projectDir, fakeHome);
}

async function seedWithVscode(projectDir: string, fakeHome: string): Promise<void> {
  await seedManifest(projectDir);
  await runCli(["ide", "install", "vscode"], projectDir, fakeHome);
}

// ---------------------------------------------------------------------------
// AI Tools — install/uninstall for tools not covered in greenfield-setup
// (claude and cursor installs are in greenfield-setup.e2e.test.ts)
// ---------------------------------------------------------------------------

describe.concurrent("Command Matrix: AI install/uninstall (copilot, codex, opencode, gemini)", () => {
  it("ai install copilot exits 0 and reports installed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-copilot-install");
    try {
      await seedManifest(projectDir);
      const { stdout, exitCode } = await runCli(["ai", "install", "copilot"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("copilot");
    } finally {
      await cleanup();
    }
  });

  it("ai install copilot --force reinstalls over existing", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-copilot-force");
    try {
      await seedManifest(projectDir);
      await runCli(["ai", "install", "copilot"], projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(
        ["ai", "install", "copilot", "--force"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("copilot");
    } finally {
      await cleanup();
    }
  });

  it("ai uninstall copilot exits 0 and reports removed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-copilot-uninstall");
    try {
      await seedManifest(projectDir);
      await runCli(["ai", "install", "copilot"], projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(
        ["ai", "uninstall", "copilot"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("copilot");
    } finally {
      await cleanup();
    }
  });

  it("ai install codex exits 0 and reports installed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-codex-install");
    try {
      await seedManifest(projectDir);
      const { stdout, exitCode } = await runCli(["ai", "install", "codex"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("codex");
    } finally {
      await cleanup();
    }
  });

  it("ai uninstall codex exits 0", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-codex-uninstall");
    try {
      await seedManifest(projectDir);
      await runCli(["ai", "install", "codex"], projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["ai", "uninstall", "codex"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("codex");
    } finally {
      await cleanup();
    }
  });

  it("ai install opencode exits 0 and reports installed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-opencode-install");
    try {
      await seedManifest(projectDir);
      const { stdout, exitCode } = await runCli(
        ["ai", "install", "opencode"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("opencode");
    } finally {
      await cleanup();
    }
  });

  it("ai uninstall opencode exits 0", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-opencode-uninstall");
    try {
      await seedManifest(projectDir);
      await runCli(["ai", "install", "opencode"], projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(
        ["ai", "uninstall", "opencode"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("opencode");
    } finally {
      await cleanup();
    }
  });

  it("ai install gemini exits 0 and reports installed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-gemini-install");
    try {
      await seedManifest(projectDir);
      const { stdout, exitCode } = await runCli(["ai", "install", "gemini"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("gemini");
    } finally {
      await cleanup();
    }
  });

  it("ai uninstall gemini exits 0", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-gemini-uninstall");
    try {
      await seedManifest(projectDir);
      await runCli(["ai", "install", "gemini"], projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(
        ["ai", "uninstall", "gemini"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("gemini");
    } finally {
      await cleanup();
    }
  });

  it("ai install vscode exits 1 — cross-category rejection", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-cross-category");
    try {
      const { stderr, exitCode } = await runCli(["ai", "install", "vscode"], projectDir, fakeHome);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Unknown AI tool: vscode");
      expect(stderr).toContain("claude");
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// AI Tools — list / status / update / doctor / restore
// (not covered by any existing journey)
// ---------------------------------------------------------------------------

describe.concurrent("Command Matrix: AI list/status/update/doctor/restore", () => {
  it("ai list exits 0 and shows installed tool name", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-list");
    try {
      await seedWithClaude(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["ai", "list"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("claude");
    } finally {
      await cleanup();
    }
  });

  it("ai status exits 0 and reports files in sync", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-status");
    try {
      await seedWithClaude(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["ai", "status"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("in sync");
    } finally {
      await cleanup();
    }
  });

  it("ai update exits 0 and reports updated", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-update");
    try {
      await seedWithClaude(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["ai", "update"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/[Uu]pdated|up to date/);
    } finally {
      await cleanup();
    }
  });

  it("ai update claude exits 0 and reports updated for specific tool", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-update-tool");
    try {
      await seedWithClaude(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["ai", "update", "claude"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/[Uu]pdated.*claude|claude.*[Uu]pdated/);
    } finally {
      await cleanup();
    }
  });

  it("ai doctor exits 0 with healthy message", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-doctor");
    try {
      await seedWithClaude(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["ai", "doctor"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("healthy");
    } finally {
      await cleanup();
    }
  });

  it("ai restore exits 0 reporting nothing to restore when files unmodified", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ai-restore");
    try {
      await seedWithClaude(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["ai", "restore"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Nothing to restore");
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// IDE Tools — uninstall / list / status / update / doctor
// (ide install vscode is covered in greenfield-setup.e2e.test.ts)
// ---------------------------------------------------------------------------

describe.concurrent("Command Matrix: IDE list/status/update/doctor/uninstall", () => {
  it("ide uninstall vscode exits 0 and reports removed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ide-uninstall");
    try {
      await seedWithVscode(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(
        ["ide", "uninstall", "vscode"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("vscode");
    } finally {
      await cleanup();
    }
  });

  it("ide list exits 0 and shows installed tool", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ide-list");
    try {
      await seedWithVscode(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["ide", "list"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("vscode");
    } finally {
      await cleanup();
    }
  });

  it("ide status exits 0 and reports files in sync", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ide-status");
    try {
      await seedWithVscode(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["ide", "status"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("in sync");
    } finally {
      await cleanup();
    }
  });

  it("ide update exits 0 and reports updated", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ide-update");
    try {
      await seedWithVscode(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["ide", "update"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("vscode");
    } finally {
      await cleanup();
    }
  });

  it("ide doctor exits 0 with healthy message", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ide-doctor");
    try {
      await seedWithVscode(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["ide", "doctor"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("healthy");
    } finally {
      await cleanup();
    }
  });

  it("ide restore exits 0 reporting nothing to restore when files unmodified", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ide-restore");
    try {
      await seedWithVscode(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["ide", "restore"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Nothing to restore");
    } finally {
      await cleanup();
    }
  });

  it("ide install claude exits 1 — cross-category rejection", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("ide-cross-category");
    try {
      const { stderr, exitCode } = await runCli(["ide", "install", "claude"], projectDir, fakeHome);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Unknown IDE tool: claude");
    } finally {
      await cleanup();
    }
  });
});

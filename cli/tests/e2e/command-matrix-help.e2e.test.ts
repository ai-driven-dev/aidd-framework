import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const AIDD_DIR = ".aidd";
const EMPTY_MANIFEST = { version: 8, tools: {} };

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
  await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);
}

describe.concurrent("Command Matrix: Help", () => {
  it("aidd --help exits 0 and lists top-level commands", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("help-root");
    try {
      const { stdout, exitCode } = await runCli(["--help"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("setup");
      expect(stdout).toContain("framework");
      expect(stdout).toContain("plugin");
      expect(stdout).toContain("marketplace");
      expect(stdout).toContain("auth");
      expect(stdout).toContain("doctor");
      expect(stdout).toContain("sync");
      expect(stdout).toContain("translate");
      expect(stdout).toContain("update");
      // `ai`/`ide` are retired behind `--tool`.
      expect(stdout).not.toMatch(/^\s*ai\s/m);
      expect(stdout).not.toMatch(/^\s*ide\s/m);
    } finally {
      await cleanup();
    }
  });

  it("aidd framework --help exits 0 and lists framework subcommands", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("help-framework");
    try {
      const { stdout, exitCode } = await runCli(["framework", "--help"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("install");
      expect(stdout).toContain("remove");
      expect(stdout).toContain("update");
      // The framework verbs are install/remove/update only.
      expect(stdout).not.toMatch(/^\s*build\s/m);
    } finally {
      await cleanup();
    }
  });

  it("aidd plugin --help exits 0 and lists plugin subcommands", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("help-plugin");
    try {
      const { stdout, exitCode } = await runCli(["plugin", "--help"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).not.toContain("add");
      expect(stdout).toContain("remove");
      expect(stdout).toContain("install");
      expect(stdout).toContain("search");
      // `plugin doctor` folded into `doctor --plugin`.
      expect(stdout).not.toMatch(/^\s*doctor\s/m);
    } finally {
      await cleanup();
    }
  });

  it("aidd marketplace --help exits 0 and lists marketplace subcommands", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("help-marketplace");
    try {
      const { stdout, exitCode } = await runCli(["marketplace", "--help"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("add");
      expect(stdout).toContain("list");
      expect(stdout).toContain("remove");
      expect(stdout).toContain("refresh");
      expect(stdout).not.toContain("browse");
    } finally {
      await cleanup();
    }
  });

  it("aidd auth --help exits 0 and lists auth subcommands", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("help-auth");
    try {
      const { stdout, exitCode } = await runCli(["auth", "--help"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("login");
      expect(stdout).toContain("logout");
      expect(stdout).toContain("status");
    } finally {
      await cleanup();
    }
  });

  it("aidd setup --help shows simplified flag surface (6 flags + --no-default-marketplace)", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("help-setup");
    try {
      const { stdout, exitCode } = await runCli(["setup", "--help"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("--source");
      expect(stdout).toContain("--ai");
      expect(stdout).toContain("--ide");
      expect(stdout).toContain("--plugins");
      expect(stdout).toContain("--release");
      expect(stdout).toContain("--yes");
      expect(stdout).not.toContain("--all-plugins");
      expect(stdout).not.toContain("--recommended-plugins");
      // --all dropped (use --ai all --ide all)
      expect(stdout).not.toMatch(/--all\b(?! options)/);
      expect(stdout).not.toContain("--from");
      expect(stdout).not.toContain("--switch-mode");
      expect(stdout).not.toContain("--mode");
      expect(stdout).not.toContain("--repo");
    } finally {
      await cleanup();
    }
  });

  it("aidd install (no --help) exits 1 with unknown command error", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("help-unknown-install");
    try {
      const { stderr, exitCode } = await runCli(["install"], projectDir, fakeHome);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("unknown command");
      expect(stderr).toContain("install");
    } finally {
      await cleanup();
    }
  });

  it("aidd uninstall exits 1 with unknown command error", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("help-unknown-uninstall");
    try {
      const { stderr, exitCode } = await runCli(["uninstall"], projectDir, fakeHome);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("unknown command");
    } finally {
      await cleanup();
    }
  });

  it("aidd cache exits 1 with unknown command error", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("help-unknown-cache");
    try {
      const { stderr, exitCode } = await runCli(["cache"], projectDir, fakeHome);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("unknown command");
    } finally {
      await cleanup();
    }
  });

  it("aidd config exits 1 with unknown command error", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("help-unknown-config");
    try {
      const { stderr, exitCode } = await runCli(["config"], projectDir, fakeHome);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("unknown command");
    } finally {
      await cleanup();
    }
  });

  it("aidd install --help exits 0 (Commander.js intercepts --help before unknown command check)", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("help-unknown-install-flag");
    try {
      const { stdout, exitCode } = await runCli(["install", "--help"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage:");
    } finally {
      await cleanup();
    }
  });

  // Retired spellings must answer "unknown command", not silently do something else.
  it.each(["ai", "ide", "status", "restore", "self-update"])(
    "aidd %s exits 1 with unknown command error (retired in phase 18)",
    async (retired) => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv(`help-retired-${retired}`);
      try {
        const { stderr, exitCode } = await runCli([retired], projectDir, fakeHome);
        expect(exitCode).toBe(1);
        expect(stderr).toMatch(/unknown command/i);
      } finally {
        await cleanup();
      }
    }
  );
});

describe.concurrent("Command Matrix: Globals", () => {
  it("doctor exits 0 and reports installation is healthy", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("global-doctor");
    try {
      await seedWithClaude(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["doctor"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("healthy");
    } finally {
      await cleanup();
    }
  });

  it("sync exits 0 reporting nothing to restore when files unmodified", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("global-sync");
    try {
      await seedWithClaude(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["sync"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Nothing to restore");
    } finally {
      await cleanup();
    }
  });

  it("update --check works without authentication", async () => {
    // --check performs a real npm lookup, so the exit code tracks network reachability;
    // assert only that authentication is never demanded.
    const { projectDir, fakeHome, cleanup } = await createTestEnv("global-update-check");
    try {
      const { stderr } = await runCli(["update", "--check"], projectDir, fakeHome);
      expect(stderr).not.toMatch(/[Nn]ot authenticated|auth login/);
    } finally {
      await cleanup();
    }
  });
});

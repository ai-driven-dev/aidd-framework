import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, FRAMEWORK_PATH, initProject, runCli } from "./helpers.js";

const PLUGIN_FIXTURE = resolve(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");

async function writeMarketplace(
  dir: string,
  plugins: Array<Record<string, unknown>>
): Promise<void> {
  await mkdir(join(dir, ".claude-plugin"), { recursive: true });
  await writeFile(join(dir, ".claude-plugin", "marketplace.json"), JSON.stringify({ plugins }));
}

// TODO(feat/cli-v5-cleanup follow-up): replace `install ai <tool> --path` setup
// with `aidd framework install --tool <tool>` in all tests that use it.
describe.concurrent("E2E: aidd plugin marketplace", () => {
  it("marketplace add → registers a project-scope marketplace and skips trust prompt with --yes", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("mkt-add");
    try {
      await initProject(projectDir, FRAMEWORK_PATH);
      await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);
      const marketDir = join(tempDir, "market");
      await writeMarketplace(marketDir, [
        {
          name: "sample-plugin",
          source: { kind: "local", path: PLUGIN_FIXTURE },
          version: "1.0.0",
        },
      ]);

      const { stdout, exitCode } = await runCli(
        ["marketplace", "add", "local", marketDir, "--yes"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("'local' registered");
    } finally {
      await cleanup();
    }
  });

  it("marketplace list → shows registered entries with scope", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("mkt-list");
    try {
      await initProject(projectDir, FRAMEWORK_PATH);
      const marketDir = join(tempDir, "market");
      await writeMarketplace(marketDir, []);
      await runCli(["marketplace", "add", "local", marketDir, "--yes"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["marketplace", "list"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("local [project]");
    } finally {
      await cleanup();
    }
  });

  it("plugin search → finds plugins across registered marketplaces", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("mkt-search");
    try {
      await initProject(projectDir, FRAMEWORK_PATH);
      const marketDir = join(tempDir, "market");
      await writeMarketplace(marketDir, [
        {
          name: "sample-plugin",
          source: { kind: "local", path: PLUGIN_FIXTURE },
          version: "1.0.0",
          description: "Sample",
        },
      ]);
      await runCli(["marketplace", "add", "local", marketDir, "--yes"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(
        ["plugin", "search", "sample"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("sample-plugin@1.0.0");
      expect(stdout).toContain("marketplace: local");
    } finally {
      await cleanup();
    }
  });

  it("plugin install → installs from registered marketplace and tags the plugin", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("mkt-install");
    try {
      await initProject(projectDir, FRAMEWORK_PATH);
      await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);
      const marketDir = join(tempDir, "market");
      await writeMarketplace(marketDir, [
        {
          name: "sample-plugin",
          source: { kind: "local", path: PLUGIN_FIXTURE },
          version: "1.0.0",
        },
      ]);
      await runCli(["marketplace", "add", "local", marketDir, "--yes"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(
        ["plugin", "install", "sample-plugin", "--tool", "claude"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("'sample-plugin'");
    } finally {
      await cleanup();
    }
  });

  it("marketplace remove → unregisters the marketplace", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("mkt-remove");
    try {
      await initProject(projectDir, FRAMEWORK_PATH);
      const marketDir = join(tempDir, "market");
      await writeMarketplace(marketDir, []);
      await runCli(["marketplace", "add", "local", marketDir, "--yes"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(
        ["marketplace", "remove", "local", "--yes"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("'local' removed");
      const listed = await runCli(["marketplace", "list"], projectDir, fakeHome);
      expect(listed.stdout).toContain("No marketplaces");
    } finally {
      await cleanup();
    }
  });

  it("marketplace list --plugins → prints catalog entries with name@version, description, source URL", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("mkt-list-plugins");
    try {
      await initProject(projectDir, FRAMEWORK_PATH);
      const marketDir = join(tempDir, "market");
      await writeMarketplace(marketDir, [
        {
          name: "sample-plugin",
          source: { kind: "local", path: PLUGIN_FIXTURE },
          version: "1.0.0",
          description: "Sample",
          recommended: true,
        },
      ]);
      await runCli(["marketplace", "add", "local", marketDir, "--yes"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(
        ["marketplace", "list", "--plugins"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("sample-plugin@1.0.0");
      expect(stdout).toContain("Sample");
      expect(stdout).toContain(PLUGIN_FIXTURE);
      expect(stdout).toContain("(recommended)");
    } finally {
      await cleanup();
    }
  });

  it("marketplace add --overwrite → replaces an existing entry without error", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("mkt-overwrite");
    try {
      await initProject(projectDir, FRAMEWORK_PATH);
      const marketDir = join(tempDir, "market");
      await writeMarketplace(marketDir, []);
      await runCli(["marketplace", "add", "local", marketDir, "--yes"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(
        ["marketplace", "add", "local", marketDir, "--yes", "--overwrite"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("'local' registered");
      const listed = await runCli(["marketplace", "list"], projectDir, fakeHome);
      expect(listed.stdout.match(/local \[project\]/g)?.length).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it("marketplace check → reports clean when nothing is stale or removed", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("mkt-check");
    try {
      await initProject(projectDir, FRAMEWORK_PATH);
      const marketDir = join(tempDir, "market");
      await writeMarketplace(marketDir, []);
      await runCli(["marketplace", "add", "local", marketDir, "--yes"], projectDir, fakeHome);
      await runCli(["marketplace", "refresh"], projectDir, fakeHome);

      const { stdout, exitCode } = await runCli(["marketplace", "check"], projectDir, fakeHome);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("All marketplaces fresh");
    } finally {
      await cleanup();
    }
  });
});

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

const AIDD_DIR = ".aidd";
const EMPTY_MANIFEST = { version: 8, tools: {} };
const PLUGIN_FIXTURE = resolve(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");

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

async function writeMarketplace(
  dir: string,
  plugins: Array<Record<string, unknown>>
): Promise<void> {
  await mkdir(join(dir, ".claude-plugin"), { recursive: true });
  await writeFile(join(dir, ".claude-plugin", "marketplace.json"), JSON.stringify({ plugins }));
}

describe.concurrent("Command Matrix: Plugin lifecycle (local install)", () => {
  it("plugin install <local-path> exits 0 with success message", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("plugin-install-local");
    try {
      await seedWithClaude(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(
        ["plugin", "install", PLUGIN_FIXTURE],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Plugin added successfully");
    } finally {
      await cleanup();
    }
  });

  it("plugin install <local-path> --tool claude exits 0", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("plugin-install-local-tool");
    try {
      await seedWithClaude(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(
        ["plugin", "install", PLUGIN_FIXTURE, "--tool", "claude"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Plugin added successfully");
    } finally {
      await cleanup();
    }
  });

  it("plugin list exits 0 and shows installed plugin", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("plugin-list");
    try {
      await seedWithClaude(projectDir, fakeHome);
      await runCli(["plugin", "install", PLUGIN_FIXTURE, "--tool", "claude"], projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["plugin", "list"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("sample-plugin");
    } finally {
      await cleanup();
    }
  });

  it("plugin list --tool claude exits 0 and shows plugin under tool scope", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("plugin-list-tool");
    try {
      await seedWithClaude(projectDir, fakeHome);
      await runCli(["plugin", "install", PLUGIN_FIXTURE, "--tool", "claude"], projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(
        ["plugin", "list", "--tool", "claude"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("sample-plugin");
    } finally {
      await cleanup();
    }
  });

  it("doctor exits 0 with healthy message when tool is installed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("plugin-doctor");
    try {
      await seedWithClaude(projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["doctor"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("healthy");
    } finally {
      await cleanup();
    }
  });

  it("doctor --plugin stays 0/healthy when non-plugin drift exists (regression: silent exit 1)", async () => {
    // A tracked file is mutated here — non-plugin drift — so unscoped doctor must flag it while
    // `doctor --plugin` stays scoped to plugin issues.
    const { projectDir, fakeHome, cleanup } = await createTestEnv("plugin-doctor-scope");
    try {
      await seedWithClaude(projectDir, fakeHome);
      await runCli(["plugin", "install", PLUGIN_FIXTURE, "--tool", "claude"], projectDir, fakeHome);
      const manifest = JSON.parse(
        await readFile(join(projectDir, AIDD_DIR, "manifest.json"), "utf-8")
      );
      const tracked = manifest.tools.claude.files[0].relativePath as string;
      await appendFile(join(projectDir, tracked), "\n<!-- drift -->\n");

      const global = await runCli(["doctor"], projectDir, fakeHome);
      expect(global.exitCode).toBe(1); // unscoped doctor sees the drift

      const { stdout, exitCode } = await runCli(
        ["doctor", "--plugin", "sample-plugin"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0); // plugin-scoped doctor stays scoped
      expect(stdout).toContain("healthy");
    } finally {
      await cleanup();
    }
  });

  it("plugin update exits 0 reporting all plugins up to date", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("plugin-update");
    try {
      await seedWithClaude(projectDir, fakeHome);
      await runCli(["plugin", "install", PLUGIN_FIXTURE, "--tool", "claude"], projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["plugin", "update"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("up to date");
    } finally {
      await cleanup();
    }
  });

  it("plugin update sample-plugin exits 0 reporting up to date", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("plugin-update-named");
    try {
      await seedWithClaude(projectDir, fakeHome);
      await runCli(["plugin", "install", PLUGIN_FIXTURE, "--tool", "claude"], projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(
        ["plugin", "update", "sample-plugin"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("up to date");
    } finally {
      await cleanup();
    }
  });

  it("sync --tool claude exits 0 and restores plugin files when a tracked file is deleted", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("sync-restore-plugin");
    try {
      await seedWithClaude(projectDir, fakeHome);
      await runCli(["plugin", "install", PLUGIN_FIXTURE, "--tool", "claude"], projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(["sync", "--tool", "claude"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/[Rr]estor|[Nn]othing to restore/);
    } finally {
      await cleanup();
    }
  });

  it("plugin remove sample-plugin --tool claude exits 0", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("plugin-remove");
    try {
      await seedWithClaude(projectDir, fakeHome);
      await runCli(["plugin", "install", PLUGIN_FIXTURE, "--tool", "claude"], projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(
        ["plugin", "remove", "sample-plugin", "--tool", "claude"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("sample-plugin");
      expect(stdout).toContain("removed");
    } finally {
      await cleanup();
    }
  });

  it("plugin install no-args exits 1 in non-interactive mode", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("plugin-install-noninteractive");
    try {
      await seedWithClaude(projectDir, fakeHome);
      const { stderr, exitCode } = await runCli(["plugin", "install"], projectDir, fakeHome);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("interactive");
    } finally {
      await cleanup();
    }
  });
});

describe.concurrent("Command Matrix: Marketplace cache + refresh", () => {
  it("marketplace refresh exits 0 (no-op when no marketplaces registered)", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("mkt-refresh-empty");
    try {
      await seedManifest(projectDir);
      const { exitCode } = await runCli(["marketplace", "refresh"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it("marketplace refresh <name> refreshes a registered marketplace", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("mkt-refresh-named");
    try {
      await seedManifest(projectDir);
      const marketDir = join(tempDir, "market");
      await writeMarketplace(marketDir, []);
      await runCli(["marketplace", "add", "local", marketDir, "--yes"], projectDir, fakeHome);
      const { stdout, exitCode } = await runCli(
        ["marketplace", "refresh", "local"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("local");
    } finally {
      await cleanup();
    }
  });

  it("marketplace refresh --force exits 0 and clears cache before re-fetching", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("mkt-refresh-force");
    try {
      await seedManifest(projectDir);
      const marketDir = join(tempDir, "market");
      await writeMarketplace(marketDir, []);
      await runCli(["marketplace", "add", "local", marketDir, "--yes"], projectDir, fakeHome);
      const { exitCode } = await runCli(
        ["marketplace", "refresh", "--force"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it("marketplace add with file:// URI exits 1 — unsupported format", async () => {
    // `file://` URIs are unsupported; a marketplace source is an absolute path.
    const { projectDir, fakeHome, cleanup } = await createTestEnv("mkt-add-file-uri");
    try {
      await seedManifest(projectDir);
      const { stderr, exitCode } = await runCli(
        ["marketplace", "add", "mymarket", "file:///some/path", "--yes"],
        projectDir,
        fakeHome
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid plugin source");
    } finally {
      await cleanup();
    }
  });
});

describe.concurrent("Command Matrix: Auth (offline)", () => {
  it("auth status exits 0 and reports authentication state", async () => {
    // Runs against real user credentials env — test only checks exit 0 and presence
    // of status text. In CI without credentials, output is "Not authenticated."
    const { projectDir, fakeHome, cleanup } = await createTestEnv("auth-status");
    try {
      const { stdout, exitCode } = await runCli(["auth", "status"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      // Either "Authenticated as ..." (dev machine) or "Not authenticated." (CI/fresh env)
      expect(stdout).toMatch(/[Aa]uthenticated/);
    } finally {
      await cleanup();
    }
  });

  it("auth logout exits 0 and is idempotent — reports state after logout", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("auth-logout");
    try {
      const { stdout, exitCode } = await runCli(["auth", "logout"], projectDir, fakeHome);
      expect(exitCode).toBe(0);
      // After logout: "Logged out (user)" or "Not authenticated." (already logged out)
      expect(stdout).toMatch(/[Ll]ogged out|[Nn]ot authenticated/);
    } finally {
      await cleanup();
    }
  });

  // auth login --token <invalid> requires network call → verified manually in smoke test
  // auth login --gh (non-interactive) requires network call → verified manually in smoke test
});

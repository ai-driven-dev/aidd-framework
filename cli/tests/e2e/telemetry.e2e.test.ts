import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, gitInit, gitSetOriginRemote, runCli } from "./helpers.js";

const AIDD_DIR = ".aidd";
const SWITCH_PATH = join(AIDD_DIR, "config.json");
const LOCAL_SETTINGS_PATH = join(".claude", "settings.local.json");
const PROJECT_SETTINGS_PATH = join(".claude", "settings.json");
const ENDPOINT = "http://127.0.0.1:4318";

// Distinct from this cli repo's own remote (ai-driven-dev/framework): if a leaked GIT_DIR
// ever pointed project-id resolution at the real repo instead of the temp one, the
// resolved id would silently become the wrong value instead of this one.
const FAKE_REMOTE = "git@github.com:acme-test/widget-telemetry.git";
const FAKE_PROJECT_ID = "acme-test/widget-telemetry";

async function seedManifest(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, AIDD_DIR), { recursive: true });
  await writeFile(
    join(projectDir, AIDD_DIR, "manifest.json"),
    JSON.stringify({ version: 5, tools: {}, marketplaces: {} }),
    "utf-8"
  );
}

// Byte-identity below depends on this: the CLI's merge/unmerge round trip is not
// format-preserving, only canonical-`JSON.stringify(x, null, 2)`-preserving. A seed with
// 4-space indent or a trailing newline would legitimately fail the round trip.
async function seedUnrelatedLocalSettings(projectDir: string): Promise<string> {
  const content = JSON.stringify(
    { permissions: { allow: ["Bash(ls:*)"] }, model: "opus" },
    null,
    2
  );
  await mkdir(join(projectDir, ".claude"), { recursive: true });
  await writeFile(join(projectDir, LOCAL_SETTINGS_PATH), content, "utf-8");
  return content;
}

async function installClaude(projectDir: string, fakeHome: string): Promise<void> {
  const result = await runCli(["ai", "install", "claude"], projectDir, fakeHome);
  expect(result.exitCode).toBe(0);
}

describe.concurrent("E2E: aidd telemetry", () => {
  it("round-trips: on, on again, off leave the local settings file byte-identical, unrelated content included", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-roundtrip");
    try {
      await gitInit(projectDir);
      await seedManifest(projectDir);
      await installClaude(projectDir, fakeHome);
      const before = await seedUnrelatedLocalSettings(projectDir);

      const on1 = await runCli(["telemetry", "on", "--endpoint", ENDPOINT], projectDir, fakeHome);
      expect(on1.exitCode).toBe(0);
      const afterOn1 = await readFile(join(projectDir, LOCAL_SETTINGS_PATH), "utf-8");
      expect(afterOn1).not.toBe(before);
      expect(afterOn1).toContain("CLAUDE_CODE_ENABLE_TELEMETRY");
      // Unrelated content survives the first write untouched.
      expect(afterOn1).toContain('"model": "opus"');

      // Re-enabling with the endpoint reused from .aidd/config.json must not perturb the file.
      const on2 = await runCli(["telemetry", "on"], projectDir, fakeHome);
      expect(on2.exitCode).toBe(0);
      const afterOn2 = await readFile(join(projectDir, LOCAL_SETTINGS_PATH), "utf-8");
      expect(afterOn2).toBe(afterOn1);

      const off = await runCli(["telemetry", "off"], projectDir, fakeHome);
      expect(off.exitCode).toBe(0);

      const after = await readFile(join(projectDir, LOCAL_SETTINGS_PATH), "utf-8");
      expect(after).toBe(before);

      // The switch itself is deliberately NOT byte-identical: `off` sets enabled: false and
      // preserves the endpoint, it never deletes .aidd/config.json.
      const switchFile = JSON.parse(await readFile(join(projectDir, SWITCH_PATH), "utf-8"));
      expect(switchFile.telemetry).toEqual({ enabled: false, endpoint: ENDPOINT });
    } finally {
      await cleanup();
    }
  });

  it("resolves aidd.project_id from the temporary repository's own remote, never a leaked GIT_DIR", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-projectid");
    try {
      await gitInit(projectDir);
      await gitSetOriginRemote(projectDir, FAKE_REMOTE);
      await seedManifest(projectDir);
      await installClaude(projectDir, fakeHome);

      const on = await runCli(["telemetry", "on", "--endpoint", ENDPOINT], projectDir, fakeHome);
      expect(on.exitCode).toBe(0);

      const settings = await readFile(join(projectDir, LOCAL_SETTINGS_PATH), "utf-8");
      expect(settings).toContain(`aidd.project_id=${FAKE_PROJECT_ID}`);
      // This cli repo's own remote (ai-driven-dev/framework) must never leak through.
      expect(settings).not.toContain("ai-driven-dev/framework");
    } finally {
      await cleanup();
    }
  });

  it("--scope project without --yes writes nothing at all, checked on disk, and exits non-zero", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-scope-guard");
    try {
      await gitInit(projectDir);
      await seedManifest(projectDir);
      await installClaude(projectDir, fakeHome);
      const projectSettingsBefore = await readFile(
        join(projectDir, PROJECT_SETTINGS_PATH),
        "utf-8"
      );

      const result = await runCli(
        ["telemetry", "on", "--endpoint", ENDPOINT, "--scope", "project"],
        projectDir,
        fakeHome
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("--yes");
      // Neither the AIDD switch nor the git-tracked settings file was written.
      expect(existsSync(join(projectDir, SWITCH_PATH))).toBe(false);
      const projectSettingsAfter = await readFile(join(projectDir, PROJECT_SETTINGS_PATH), "utf-8");
      expect(projectSettingsAfter).toBe(projectSettingsBefore);
    } finally {
      await cleanup();
    }
  });

  it("--scope project --yes writes the tracked settings file and leaves the local file untouched", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-scope-yes");
    try {
      await gitInit(projectDir);
      await seedManifest(projectDir);
      await installClaude(projectDir, fakeHome);
      expect(existsSync(join(projectDir, LOCAL_SETTINGS_PATH))).toBe(false);

      const result = await runCli(
        ["telemetry", "on", "--endpoint", ENDPOINT, "--scope", "project", "--yes"],
        projectDir,
        fakeHome
      );
      expect(result.exitCode).toBe(0);

      // Read the resolved path directly — never the path the command printed.
      const projectSettings = await readFile(join(projectDir, PROJECT_SETTINGS_PATH), "utf-8");
      expect(projectSettings).toContain("CLAUDE_CODE_ENABLE_TELEMETRY");
      expect(existsSync(join(projectDir, LOCAL_SETTINGS_PATH))).toBe(false);
      // Nor did it reach the home-scope file — proving the write landed in exactly one place.
      expect(existsSync(join(fakeHome, ".claude", "settings.json"))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("--scope user writes to the resolved home-directory settings file", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-scope-user");
    try {
      await gitInit(projectDir);
      await seedManifest(projectDir);
      await installClaude(projectDir, fakeHome);

      const result = await runCli(
        ["telemetry", "on", "--endpoint", ENDPOINT, "--scope", "user", "--yes"],
        projectDir,
        fakeHome
      );
      expect(result.exitCode).toBe(0);

      // Independently resolved path — home directory Claude settings, never parsed from stdout.
      const userSettingsPath = join(fakeHome, ".claude", "settings.json");
      const userSettings = await readFile(userSettingsPath, "utf-8");
      expect(userSettings).toContain("CLAUDE_CODE_ENABLE_TELEMETRY");
      expect(existsSync(join(projectDir, LOCAL_SETTINGS_PATH))).toBe(false);
      // `.claude/settings.json` exists (marketplace settings from install) but must not have
      // gained the telemetry env block — the write landed only at the home-scope path.
      const projectSettings = await readFile(join(projectDir, PROJECT_SETTINGS_PATH), "utf-8");
      expect(projectSettings).not.toContain("CLAUDE_CODE_ENABLE_TELEMETRY");
    } finally {
      await cleanup();
    }
  });

  it("no endpoint on flag or config is a hard error that writes nothing", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-no-endpoint");
    try {
      const result = await runCli(["telemetry", "on"], projectDir, fakeHome);

      expect(result.exitCode).not.toBe(0);
      expect(existsSync(join(projectDir, SWITCH_PATH))).toBe(false);
      expect(existsSync(join(projectDir, LOCAL_SETTINGS_PATH))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("reports cursor as not enableable by us, and the run still succeeds", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-cursor");
    try {
      await gitInit(projectDir);
      await seedManifest(projectDir);
      await installClaude(projectDir, fakeHome);
      const cursorInstall = await runCli(["ai", "install", "cursor"], projectDir, fakeHome);
      expect(cursorInstall.exitCode).toBe(0);

      const result = await runCli(
        ["telemetry", "on", "--endpoint", ENDPOINT],
        projectDir,
        fakeHome
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("cursor: cannot be enabled by us");
      expect(result.stdout).not.toMatch(/cursor: enabled/);
    } finally {
      await cleanup();
    }
  });

  it("off on a project never turned on leaves the switch absent and every tool untouched", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-switch-off");
    try {
      await gitInit(projectDir);
      await seedManifest(projectDir);
      await installClaude(projectDir, fakeHome);
      const cursorInstall = await runCli(["ai", "install", "cursor"], projectDir, fakeHome);
      expect(cursorInstall.exitCode).toBe(0);

      // Never turned on: `telemetry off` must leave every tool's config untouched.
      const off = await runCli(["telemetry", "off"], projectDir, fakeHome);
      expect(off.exitCode).toBe(0);
      expect(off.stdout).toContain("already off");

      expect(existsSync(join(projectDir, SWITCH_PATH))).toBe(false);
      expect(existsSync(join(projectDir, LOCAL_SETTINGS_PATH))).toBe(false);
      const projectSettings = await readFile(join(projectDir, PROJECT_SETTINGS_PATH), "utf-8");
      expect(projectSettings).not.toContain("CLAUDE_CODE_ENABLE_TELEMETRY");
    } finally {
      await cleanup();
    }
  });
});

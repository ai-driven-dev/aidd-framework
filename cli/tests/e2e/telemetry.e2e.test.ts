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

describe.concurrent("E2E: aidd telemetry on/off — the switch alone", () => {
  it("on succeeds with no endpoint anywhere, and writes no tool's settings file", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-on-no-endpoint");
    try {
      await gitInit(projectDir);
      await seedManifest(projectDir);
      await installClaude(projectDir, fakeHome);

      const on = await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);

      expect(on.exitCode, on.stderr).toBe(0);
      expect(existsSync(join(projectDir, SWITCH_PATH))).toBe(true);
      expect(existsSync(join(projectDir, LOCAL_SETTINGS_PATH))).toBe(false);
      const switchFile = JSON.parse(await readFile(join(projectDir, SWITCH_PATH), "utf-8"));
      expect(switchFile.telemetry).toEqual({ enabled: true });
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

  it("off leaves an endpoint configuration untouched — the tool settings and the manifest record both survive", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-off-endpoint-safe");
    try {
      await gitInit(projectDir);
      await seedManifest(projectDir);
      await installClaude(projectDir, fakeHome);

      const armed = await runCli(["telemetry", "endpoint", ENDPOINT], projectDir, fakeHome);
      expect(armed.exitCode, armed.stderr).toBe(0);
      const settingsAfterArm = await readFile(join(projectDir, LOCAL_SETTINGS_PATH), "utf-8");
      expect(settingsAfterArm).toContain("CLAUDE_CODE_ENABLE_TELEMETRY");

      const off = await runCli(["telemetry", "off"], projectDir, fakeHome);
      expect(off.exitCode, off.stderr).toBe(0);

      // The settings file `endpoint` wrote is untouched, byte for byte.
      const settingsAfterOff = await readFile(join(projectDir, LOCAL_SETTINGS_PATH), "utf-8");
      expect(settingsAfterOff).toBe(settingsAfterArm);

      // A later `endpoint clear` can still find and undo it — the manifest record survived
      // `off` too, so this is not a silent no-op.
      const cleared = await runCli(["telemetry", "endpoint", "clear"], projectDir, fakeHome);
      expect(cleared.exitCode, cleared.stderr).toBe(0);
      expect(existsSync(join(projectDir, LOCAL_SETTINGS_PATH))).toBe(false);
    } finally {
      await cleanup();
    }
  });
});

describe.concurrent("E2E: aidd telemetry endpoint", () => {
  it("writes tool settings, and `endpoint clear` restores the file byte-identically", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-endpoint-roundtrip");
    try {
      await gitInit(projectDir);
      await seedManifest(projectDir);
      await installClaude(projectDir, fakeHome);
      const before = await seedUnrelatedLocalSettings(projectDir);

      const armed = await runCli(["telemetry", "endpoint", ENDPOINT], projectDir, fakeHome);
      expect(armed.exitCode).toBe(0);
      const afterArm = await readFile(join(projectDir, LOCAL_SETTINGS_PATH), "utf-8");
      expect(afterArm).not.toBe(before);
      expect(afterArm).toContain("CLAUDE_CODE_ENABLE_TELEMETRY");
      // Unrelated content survives the write untouched.
      expect(afterArm).toContain('"model": "opus"');

      const cleared = await runCli(["telemetry", "endpoint", "clear"], projectDir, fakeHome);
      expect(cleared.exitCode).toBe(0);
      const after = await readFile(join(projectDir, LOCAL_SETTINGS_PATH), "utf-8");
      expect(after).toBe(before);
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

      const result = await runCli(["telemetry", "endpoint", ENDPOINT], projectDir, fakeHome);
      expect(result.exitCode).toBe(0);

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
        ["telemetry", "endpoint", ENDPOINT, "--scope", "project"],
        projectDir,
        fakeHome
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("--yes");
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
        ["telemetry", "endpoint", ENDPOINT, "--scope", "project", "--yes"],
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
        ["telemetry", "endpoint", ENDPOINT, "--scope", "user", "--yes"],
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

  it("reports cursor as not enableable by us, and the run still succeeds", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-cursor");
    try {
      await gitInit(projectDir);
      await seedManifest(projectDir);
      await installClaude(projectDir, fakeHome);
      const cursorInstall = await runCli(["ai", "install", "cursor"], projectDir, fakeHome);
      expect(cursorInstall.exitCode).toBe(0);

      const result = await runCli(["telemetry", "endpoint", ENDPOINT], projectDir, fakeHome);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Cursor: cannot be enabled by us");
      expect(result.stdout).not.toMatch(/cursor: enabled/);
    } finally {
      await cleanup();
    }
  });
});

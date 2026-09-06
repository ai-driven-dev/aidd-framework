import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

const AIDD_DIR = ".aidd";
const SWITCH_PATH = join(AIDD_DIR, "config.json");
const LOCAL_SETTINGS_PATH = join(".claude", "settings.local.json");
const PROJECT_SETTINGS_PATH = join(".claude", "settings.json");

async function seedManifest(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, AIDD_DIR), { recursive: true });
  await writeFile(
    join(projectDir, AIDD_DIR, "manifest.json"),
    JSON.stringify({ version: 7, tools: {}, marketplaces: {} }),
    "utf-8"
  );
}

async function installClaude(projectDir: string, fakeHome: string): Promise<void> {
  const result = await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);
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
      const cursorInstall = await runCli(
        ["framework", "install", "--tool", "cursor"],
        projectDir,
        fakeHome
      );
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

describe.concurrent("E2E: the deleted export route's commands are gone, not disabled", () => {
  it.each(["receive", "endpoint"])(
    "`telemetry %s` is refused as unknown, the way any unknown command is",
    async (removed) => {
      const { projectDir, fakeHome, cleanup } = await createTestEnv(`telemetry-removed-${removed}`);
      try {
        await gitInit(projectDir);

        const result = await runCli(["telemetry", removed], projectDir, fakeHome);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(`unknown command '${removed}'`);
      } finally {
        await cleanup();
      }
    }
  );
});

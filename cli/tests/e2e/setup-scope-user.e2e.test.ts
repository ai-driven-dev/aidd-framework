import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/runtime/git/git-environment.js";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

// CI runners carry no git identity; a commit made by a test brings its own.
const GIT_TEST_IDENTITY = ["-c", "user.email=t@t.com", "-c", "user.name=t"];

const execFileAsync = promisify(execFile);
const FRAMEWORK_REAL_PATH = resolve(process.cwd(), "tests/fixtures/framework-real");

async function gitStatusPorcelain(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
    cwd,
    env: environmentWithoutGitVariables(process.env),
  });
  return stdout;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
}

describe("E2E: setup --scope user writes nothing under the project", () => {
  it("leaves the git-tracked project untouched and writes the user manifest under fakeHome", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("scope-user-setup");
    try {
      await gitInit(projectDir);
      // A commit so `git status --porcelain` starts clean: in a freshly `git init`ed directory
      // every file reads as untracked regardless of what `setup` wrote.
      await execFileAsync("git", [...GIT_TEST_IDENTITY, "commit", "--allow-empty", "-m", "empty"], {
        cwd: projectDir,
        env: environmentWithoutGitVariables(process.env),
      });

      const setupResult = await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          FRAMEWORK_REAL_PATH,
          "--ai",
          "claude",
          "--plugins",
          "none",
          "--yes",
          "--scope",
          "user",
        ],
        projectDir,
        fakeHome
      );
      expect(setupResult.exitCode).toBe(0);

      // A full-repository delta, not a list of paths this test happens to think of:
      // `setup --scope user` must land nothing under the project.
      expect(await gitStatusPorcelain(projectDir)).toBe("");

      const manifest = await readJson(join(fakeHome, ".config", "aidd", "manifest.json"));
      expect(manifest.version).toBe(8);
      expect(Object.keys(manifest.tools as Record<string, unknown>)).toContain("claude");

      const marketplaces = await readJson(join(fakeHome, ".config", "aidd", "marketplaces.json"));
      const names = (marketplaces.marketplaces as Array<{ name: string }>).map((m) => m.name);
      expect(names).toContain("aidd-framework");

      // `--scope user` records no shared-source claim; asserted as absence-or-empty since another
      // project on the same fakeHome could in principle have written one.
      const references = await readJson(join(fakeHome, ".config", "aidd", "references.json")).catch(
        () => ({})
      );
      const allProjectRoots = Object.values(references).flat() as string[];
      expect(allProjectRoots).toEqual([]);

      // This sandbox has no `claude`/`codex`/`copilot` binary on PATH, so these two prove only
      // that the commands resolve the user manifest and exit cleanly with native activation unrun.
      const doctorResult = await runCli(["doctor", "--scope", "user"], projectDir, fakeHome);
      expect(doctorResult.exitCode).toBe(0);

      const syncResult = await runCli(["sync", "--scope", "user"], projectDir, fakeHome);
      expect(syncResult.exitCode).toBe(0);
      expect(await gitStatusPorcelain(projectDir)).toBe("");
    } finally {
      await cleanup();
    }
  });

  it("honors --tool and refuses --plugin at --scope user for doctor and sync, rather than silently ignoring either", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("scope-user-flags");
    try {
      await gitInit(projectDir);
      await execFileAsync("git", [...GIT_TEST_IDENTITY, "commit", "--allow-empty", "-m", "empty"], {
        cwd: projectDir,
        env: environmentWithoutGitVariables(process.env),
      });

      const setupResult = await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          FRAMEWORK_REAL_PATH,
          "--ai",
          "claude,codex",
          "--plugins",
          "none",
          "--yes",
          "--scope",
          "user",
        ],
        projectDir,
        fakeHome
      );
      expect(setupResult.exitCode).toBe(0);

      // --tool narrows doctor's own user-scope tool inventory to the one tool named,
      // rather than being read and discarded.
      const doctorScoped = await runCli(
        ["doctor", "--scope", "user", "--tool", "claude"],
        projectDir,
        fakeHome
      );
      expect(doctorScoped.exitCode).toBe(0);
      expect(doctorScoped.stdout).toContain("claude");
      expect(doctorScoped.stdout).not.toContain("codex");

      // --plugin has nothing to narrow at user scope — no plugin is tracked there yet —
      // so it is refused with a real message rather than silently dropped.
      const doctorPlugin = await runCli(
        ["doctor", "--scope", "user", "--plugin", "aidd-context"],
        projectDir,
        fakeHome
      );
      expect(doctorPlugin.exitCode).toBe(1);
      expect(doctorPlugin.stderr).toContain("--plugin");

      const syncPlugin = await runCli(
        ["sync", "--scope", "user", "--plugin", "aidd-context"],
        projectDir,
        fakeHome
      );
      expect(syncPlugin.exitCode).toBe(1);
      expect(syncPlugin.stderr).toContain("--plugin");

      // A file argument has nothing to narrow either — sync's own project-scope file
      // list has no user-scope counterpart.
      const syncFiles = await runCli(
        ["sync", "--scope", "user", "some-file.md"],
        projectDir,
        fakeHome
      );
      expect(syncFiles.exitCode).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it("names the branch where nothing is registered at user scope yet, for both doctor and sync", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("scope-user-nothing-yet");
    try {
      await gitInit(projectDir);
      await execFileAsync("git", [...GIT_TEST_IDENTITY, "commit", "--allow-empty", "-m", "empty"], {
        cwd: projectDir,
        env: environmentWithoutGitVariables(process.env),
      });

      // No `setup --scope user` ever ran on this fakeHome — the user-scope manifest
      // does not exist yet.
      const doctorResult = await runCli(["doctor", "--scope", "user"], projectDir, fakeHome);
      expect(doctorResult.exitCode).toBe(0);
      expect(doctorResult.stdout).toContain("Nothing registered at user scope yet");
      expect(doctorResult.stdout).toContain("aidd setup --scope user");

      const syncResult = await runCli(["sync", "--scope", "user"], projectDir, fakeHome);
      expect(syncResult.exitCode).toBe(0);
      expect(syncResult.stdout).toContain("Nothing to sync");
    } finally {
      await cleanup();
    }
  });
});

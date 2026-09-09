import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/runtime/git/git-environment.js";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

const execFileAsync = promisify(execFile);
const RUNS_ENTRY = "aidd_docs/runs/";

async function git(args: readonly string[], cwd: string): Promise<{ stdout: string }> {
  return execFileAsync("git", [...args], { cwd, env: environmentWithoutGitVariables(process.env) });
}

async function readGitignore(projectDir: string): Promise<string | null> {
  try {
    return await readFile(join(projectDir, ".gitignore"), "utf8");
  } catch {
    return null;
  }
}

describe("aidd telemetry on carries over what the switch script did beyond flipping a flag", () => {
  it("adds the run journal to .gitignore, and nothing wider", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("runs-privacy-gitignore");
    try {
      await gitInit(projectDir);

      const result = await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      const gitignore = await readGitignore(projectDir);
      expect(gitignore?.trim()).toBe(RUNS_ENTRY.trim());
    } finally {
      await cleanup();
    }
  });

  it("an existing entry is left as it is, never duplicated", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("runs-privacy-dedupe");
    try {
      await gitInit(projectDir);
      await writeFile(join(projectDir, ".gitignore"), `node_modules/\n${RUNS_ENTRY}\n`);

      await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);

      const gitignore = (await readGitignore(projectDir)) ?? "";
      const matches = gitignore.split("\n").filter((line) => line.trim() === RUNS_ENTRY.trim());
      expect(matches.length).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it("a journal already tracked by git is named once, and nothing is removed or rewritten", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("runs-privacy-tracked");
    try {
      await gitInit(projectDir);
      await mkdir(join(projectDir, "aidd_docs", "runs"), { recursive: true });
      const trackedRelative = "aidd_docs/runs/old__vendor.jsonl";
      await writeFile(join(projectDir, trackedRelative), '{"type":"session_start"}\n');
      await git(["add", trackedRelative], projectDir);
      await git(
        [
          "-c",
          "user.email=t@t.com",
          "-c",
          "user.name=t",
          "commit",
          "-q",
          "-m",
          "committed by hand",
        ],
        projectDir
      );

      const result = await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).toMatch(/Already tracked by git/u);
      expect(result.stderr).toContain(trackedRelative);
      const log = await git(["log", "--oneline"], projectDir);
      expect(log.stdout.trim().split("\n").length).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it("nothing extra is said when no journal file is tracked", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("runs-privacy-clean");
    try {
      await gitInit(projectDir);

      const result = await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).not.toMatch(/Already tracked by git/u);
    } finally {
      await cleanup();
    }
  });

  it("turning measurement off touches neither .gitignore nor the tracked-file notice", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("runs-privacy-off");
    try {
      await gitInit(projectDir);
      await mkdir(join(projectDir, "aidd_docs", "runs"), { recursive: true });
      await writeFile(join(projectDir, "aidd_docs", "runs", "old__vendor.jsonl"), "{}\n");
      await git(["add", "aidd_docs/runs/old__vendor.jsonl"], projectDir);
      await git(
        ["-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-q", "-m", "committed"],
        projectDir
      );

      const result = await runCli(["telemetry", "off"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(await readGitignore(projectDir)).toBeNull();
      expect(result.stdout).not.toMatch(/Already tracked by git/u);
      expect(result.stderr).not.toMatch(/Already tracked by git/u);
    } finally {
      await cleanup();
    }
  });

  it("git add -A stages the .gitignore change and leaves the journal out of the index", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("runs-privacy-add-a");
    try {
      await gitInit(projectDir);

      const result = await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);
      expect(result.exitCode, result.stderr).toBe(0);

      await mkdir(join(projectDir, "aidd_docs", "runs"), { recursive: true });
      await writeFile(
        join(projectDir, "aidd_docs", "runs", "new__session.jsonl"),
        '{"type":"session_start"}\n'
      );

      await git(["add", "-A"], projectDir);
      const status = await git(["status", "--porcelain"], projectDir);
      const staged = status.stdout.trim().split("\n").filter(Boolean);
      expect(staged.some((line) => line.endsWith(".gitignore"))).toBe(true);
      expect(staged.some((line) => line.includes("aidd_docs/runs"))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("a project outside any git repository still turns on, quietly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aidd-runs-privacy-no-repo-"));
    const { fakeHome, cleanup } = await createTestEnv("runs-privacy-no-repo-home");
    try {
      const result = await runCli(["telemetry", "on", "--yes"], dir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).toBe("");
      const gitignore = await readGitignore(dir);
      expect(gitignore?.trim()).toBe(RUNS_ENTRY.trim());
    } finally {
      await cleanup();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

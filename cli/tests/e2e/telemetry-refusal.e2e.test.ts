import { execFile, execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/runtime/git/git-environment.js";
import { REPOSITORY_ROOT } from "../helpers/repository-root.js";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = REPOSITORY_ROOT;
const JOURNAL_HOOK = resolve(REPO_ROOT, "plugins/aidd-telemetry/hooks/journal.cjs");

describe("a person's own refusal, without touching a tracked file", () => {
  function hookEnv(fakeHome: string, extra?: Record<string, string>): NodeJS.ProcessEnv {
    return { ...environmentWithoutGitVariables(process.env), HOME: fakeHome, ...extra };
  }

  function journal(
    projectDir: string,
    fakeHome: string,
    sessionId: string,
    extra?: Record<string, string>
  ): void {
    execFileSync(process.execPath, [JOURNAL_HOOK, "session-start"], {
      input: JSON.stringify({
        session_id: sessionId,
        hook_event_name: "SessionStart",
        cwd: projectDir,
        transcript_path: `${fakeHome}/.claude/projects/fake/${sessionId}.jsonl`,
      }),
      cwd: projectDir,
      env: hookEnv(fakeHome, extra),
    });
  }

  async function runFileCount(projectDir: string): Promise<number> {
    try {
      const files = await readdir(`${projectDir}/aidd_docs/runs`);
      return files.filter((f) => f.endsWith(".jsonl")).length;
    } catch {
      return 0;
    }
  }

  async function gitStatus(projectDir: string): Promise<string> {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], {
      cwd: projectDir,
      env: environmentWithoutGitVariables(process.env),
    });
    return stdout;
  }

  it("refusing in this person's own environment records nothing, in a project whose tracked configuration allows it", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("refusal-basic");
    try {
      await gitInit(projectDir);
      const on = await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);
      expect(on.exitCode, on.stderr).toBe(0);

      const before = await gitStatus(projectDir);
      journal(projectDir, fakeHome, "10000000-0000-4000-8000-000000000001", {
        AIDD_TELEMETRY: "0",
      });

      expect(await runFileCount(projectDir)).toBe(0);
      const after = await gitStatus(projectDir);
      expect(after).toBe(before);
    } finally {
      await cleanup();
    }
  });

  it("an unset refusal turns nothing on by itself, and a project with measurement on still records", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("refusal-unset");
    try {
      await gitInit(projectDir);
      await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);

      journal(projectDir, fakeHome, "10000000-0000-4000-8000-000000000002");

      expect(await runFileCount(projectDir)).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it("removing the refusal records again, in the same project whose switch never changed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("refusal-removed");
    try {
      await gitInit(projectDir);
      await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);

      journal(projectDir, fakeHome, "10000000-0000-4000-8000-000000000003", {
        AIDD_TELEMETRY: "0",
      });
      expect(await runFileCount(projectDir)).toBe(0);

      journal(projectDir, fakeHome, "10000000-0000-4000-8000-000000000004");
      expect(await runFileCount(projectDir)).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it("the refusal wins over a project that turns measurement on, never the file", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("refusal-wins");
    try {
      await gitInit(projectDir);
      const on = await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);
      expect(on.exitCode, on.stderr).toBe(0);

      journal(projectDir, fakeHome, "10000000-0000-4000-8000-000000000005", {
        AIDD_TELEMETRY: "0",
      });

      expect(await runFileCount(projectDir)).toBe(0);
    } finally {
      await cleanup();
    }
  });
});

describe("turning measurement on for everyone who clones is confirmed", () => {
  it("without --yes, refuses and writes nothing, naming the consequence", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("on-requires-yes");
    try {
      await gitInit(projectDir);

      const result = await runCli(["telemetry", "on"], projectDir, fakeHome);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("--yes");
      expect(result.stderr).toContain("everyone who clones");
      await expect(readFile(`${projectDir}/.aidd/config.json`, "utf8")).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it("confirmed with --yes, writes the switch and says what was done", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("on-yes-confirmed");
    try {
      await gitInit(projectDir);

      const result = await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain("everyone who clones");
      const written = JSON.parse(await readFile(`${projectDir}/.aidd/config.json`, "utf8"));
      expect(written.telemetry).toEqual({ enabled: true });
    } finally {
      await cleanup();
    }
  });

  it("turning it off needs no confirmation", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("off-no-confirm");
    try {
      await gitInit(projectDir);
      await runCli(["telemetry", "on", "--yes"], projectDir, fakeHome);

      const off = await runCli(["telemetry", "off"], projectDir, fakeHome);

      expect(off.exitCode, off.stderr).toBe(0);
      const written = JSON.parse(await readFile(`${projectDir}/.aidd/config.json`, "utf8"));
      expect(written.telemetry.enabled).toBe(false);
    } finally {
      await cleanup();
    }
  });
});

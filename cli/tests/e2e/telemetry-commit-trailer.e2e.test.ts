import { execFile, execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { SESSION_TRAILER_TOKEN } from "../../src/contexts/telemetry/domain/formats/commit-session-trailer.js";
import { environmentWithoutGitVariables } from "../../src/runtime/git/git-environment.js";
import { cliPath, pathWithoutAidd } from "./helpers.js";

const execFileAsync = promisify(execFile);

/**
 * Real commits, read back with `git log`: an install written to a directory git ignores
 * reports success while the hook never runs, and only git itself can tell the two apart.
 */
const SESSION = "33333333-3333-4333-8333-333333333333";
const OTHER_SESSION = "44444444-4444-4444-8444-444444444444";

/** Every variable `session-anchor.ts` reads, removed: the runner's own environment already
 * carries one, so "no session made this commit" has to be stated to the spawned process. */
function withoutSessionVariables(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { CODEX_THREAD_ID, CLAUDE_CODE_SESSION_ID, ...rest } = env;
  return rest;
}

interface Repo {
  readonly dir: string;
  readonly aidd: (args: readonly string[]) => Promise<{ stdout: string }>;
  /** Passing no session variables is how a commit nobody's session made gets written. */
  readonly commit: (message: string, sessionEnv?: NodeJS.ProcessEnv) => Promise<void>;
  readonly git: (args: readonly string[], sessionEnv?: NodeJS.ProcessEnv) => Promise<string>;
  readonly messageOf: (ref: string) => Promise<string>;
}

/** A repository per test rather than one shared through a hook: these run concurrently, and
 * one test's cleanup would pull the ground out from under another. */
async function withRepo(use: (repo: Repo) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), "aidd-commit-trailer-"));
  const dir = join(tempDir, "project");
  try {
    execFileSync("git", ["init", "-q", dir], {
      env: environmentWithoutGitVariables(process.env),
    });

    // No `aidd` on PATH: the hook stands on a shell and git alone. Both session variables are
    // stripped first, since this suite may itself run inside a real session of its own.
    const env = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
      ...withoutSessionVariables(environmentWithoutGitVariables(process.env)),
      PATH: pathWithoutAidd(),
      HOME: join(tempDir, "home"),
      AIDD_USER_CONFIG_DIR: join(tempDir, "config"),
      GIT_AUTHOR_NAME: "T",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "T",
      GIT_COMMITTER_EMAIL: "t@example.com",
      ...extra,
    });

    const git = async (args: readonly string[], sessionEnv: NodeJS.ProcessEnv = {}) => {
      const { stdout } = await execFileAsync("git", [...args], { cwd: dir, env: env(sessionEnv) });
      return stdout;
    };

    await use({
      dir,
      aidd: (args) =>
        execFileAsync(process.execPath, [cliPath(), ...args], { cwd: dir, env: env() }),
      commit: async (message, sessionEnv = {}) => {
        await writeFile(join(dir, `${message}.txt`), `${message}\n`);
        await git(["add", "-A"], sessionEnv);
        await git(["commit", "-q", "-m", message], sessionEnv);
      },
      git,
      messageOf: (ref) => git(["log", "-1", "--format=%B", ref]),
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

describe.concurrent("a commit names the session that made it", () => {
  it("carries the session's own identifier once measurement is on", async () => {
    await withRepo(async (repo) => {
      await repo.aidd(["telemetry", "on", "--yes"]);

      await repo.commit("first", { CLAUDE_CODE_SESSION_ID: SESSION });

      expect(await repo.messageOf("HEAD")).toContain(`${SESSION_TRAILER_TOKEN}: ${SESSION}`);
    });
  });

  it("carries nothing when no session made the commit", async () => {
    await withRepo(async (repo) => {
      await repo.aidd(["telemetry", "on", "--yes"]);

      await repo.commit("by-hand");

      expect(await repo.messageOf("HEAD")).not.toContain(SESSION_TRAILER_TOKEN);
    });
  });

  it("carries nothing at all until measurement is turned on", async () => {
    await withRepo(async (repo) => {
      await repo.commit("before", { CLAUDE_CODE_SESSION_ID: SESSION });

      expect(await repo.messageOf("HEAD")).not.toContain(SESSION_TRAILER_TOKEN);
    });
  });

  // Codex nested inside a Claude Code session inherits the outer session's variable. A
  // commit belongs to the process that made it, never to the one that launched it.
  it("names the session actually running, not the one whose variable it inherited", async () => {
    await withRepo(async (repo) => {
      await repo.aidd(["telemetry", "on", "--yes"]);

      await repo.commit("nested", {
        CLAUDE_CODE_SESSION_ID: OTHER_SESSION,
        CODEX_THREAD_ID: SESSION,
      });

      const message = await repo.messageOf("HEAD");
      expect(message).toContain(`${SESSION_TRAILER_TOKEN}: ${SESSION}`);
      expect(message).not.toContain(OTHER_SESSION);
    });
  });

  it("writes it once, not twice, when the commit is amended", async () => {
    await withRepo(async (repo) => {
      await repo.aidd(["telemetry", "on", "--yes"]);
      await repo.commit("amended", { CLAUDE_CODE_SESSION_ID: SESSION });

      await repo.git(["commit", "-q", "--amend", "--no-edit"], {
        CLAUDE_CODE_SESSION_ID: SESSION,
      });

      const message = await repo.messageOf("HEAD");
      expect(message.split(SESSION_TRAILER_TOKEN).length - 1).toBe(1);
    });
  });

  it("stops trailering after off, and leaves the commits already made alone", async () => {
    await withRepo(async (repo) => {
      await repo.aidd(["telemetry", "on", "--yes"]);
      await repo.commit("measured", { CLAUDE_CODE_SESSION_ID: SESSION });

      await repo.aidd(["telemetry", "off"]);
      await repo.commit("after-off", { CLAUDE_CODE_SESSION_ID: SESSION });

      expect(await repo.messageOf("HEAD")).not.toContain(SESSION_TRAILER_TOKEN);
      expect(await repo.messageOf("HEAD~1")).toContain(`${SESSION_TRAILER_TOKEN}: ${SESSION}`);
    });
  });

  it("says what it did, so nobody finds a trailer in their history unannounced", async () => {
    await withRepo(async (repo) => {
      const { stdout } = await repo.aidd(["telemetry", "on", "--yes"]);

      expect(stdout).toContain(SESSION_TRAILER_TOKEN);
      expect(stdout).toContain("aidd telemetry off");
    });
  });

  it("keeps a hook the repository already ran, and commits still succeed", async () => {
    await withRepo(async (repo) => {
      const hook = join(repo.dir, ".git", "hooks", "prepare-commit-msg");
      await writeFile(hook, '#!/bin/sh\necho "theirs ran" >> "$(dirname "$1")/theirs.log"\n');
      // `fs.chmod`, never a spawned `chmod`: on Windows that binary is Git's own and may be
      // off PATH, while git runs a hook there through its shell, not through the file's mode.
      await chmod(hook, 0o755);
      await repo.aidd(["telemetry", "on", "--yes"]);

      await repo.commit("both-hooks", { CLAUDE_CODE_SESSION_ID: SESSION });

      expect(await repo.messageOf("HEAD")).toContain(`${SESSION_TRAILER_TOKEN}: ${SESSION}`);
      expect(await readFile(join(repo.dir, ".git", "theirs.log"), "utf8")).toContain("theirs ran");
    });
  });
});

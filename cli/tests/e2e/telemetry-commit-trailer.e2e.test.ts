import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { SESSION_TRAILER_TOKEN } from "../../src/domain/formats/commit-session-trailer.js";
import { environmentWithoutGitVariables } from "../../src/infrastructure/git-environment.js";
import { CLI_PATH, pathWithoutAidd } from "./helpers.js";

const execFileAsync = promisify(execFile);

/**
 * The last link of the chain, held to a real commit.
 *
 * Every other test of this feature reads a string the CLI produced. None of them prove git
 * runs the hook — which is the entire question, and the one an install written to a
 * directory git ignores answers wrongly while reporting success. So this makes actual
 * commits and reads their actual messages back with `git log`.
 *
 * The identifier a commit carries is the one a record already carries:
 * `CLAUDE_CODE_SESSION_ID` is the transcript filename the local reader resolves a Claude
 * Code session by, and `telemetry-claim.ts`'s own `firedForSession` has compared the two as
 * equal since the "hook fired" claim existed.
 */
const SESSION = "33333333-3333-4333-8333-333333333333";
const OTHER_SESSION = "44444444-4444-4444-8444-444444444444";

/** Every variable `session-anchor.ts` reads, removed. A test that means "no session made
 * this commit" has to say so to the process it spawns, not merely refrain from mentioning
 * it: the runner's own environment already carries one. */
function withoutSessionVariables(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { CODEX_THREAD_ID, CLAUDE_CODE_SESSION_ID, ...rest } = env;
  return rest;
}

interface Repo {
  readonly dir: string;
  /** `aidd`, run from the repository, with a sandboxed home and no `aidd` on PATH. */
  readonly aidd: (args: readonly string[]) => Promise<{ stdout: string }>;
  /** One real commit, carrying whatever session variables are passed — including none,
   * which is how a commit nobody's session made gets written. */
  readonly commit: (message: string, sessionEnv?: NodeJS.ProcessEnv) => Promise<void>;
  readonly git: (args: readonly string[], sessionEnv?: NodeJS.ProcessEnv) => Promise<string>;
  readonly messageOf: (ref: string) => Promise<string>;
}

/** A repository of its own per test, torn down in `finally`. Each test owns its directory
 * rather than sharing one through a hook: these run concurrently, and shared state here
 * meant one test's cleanup pulling the ground out from under another. */
async function withRepo(use: (repo: Repo) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), "aidd-commit-trailer-"));
  const dir = join(tempDir, "project");
  try {
    execFileSync("git", ["init", "-q", dir], {
      env: environmentWithoutGitVariables(process.env),
    });

    // No `aidd` on PATH: the hook has to stand on a shell and git alone, which is what it
    // promises. `HOME` and the config dir are sandboxed, so nothing here reaches the
    // machine's own profile.
    //
    // Both session variables are stripped before anything is added back. This suite runs
    // inside a real Claude Code session, so a bare `process.env` carries a real
    // `CLAUDE_CODE_SESSION_ID` — and the case that matters most here, a commit no session
    // made, passed a trailer straight through while appearing to prove the opposite.
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
        execFileAsync(process.execPath, [CLI_PATH, ...args], { cwd: dir, env: env() }),
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
      execFileSync("chmod", ["+x", hook]);
      await repo.aidd(["telemetry", "on", "--yes"]);

      await repo.commit("both-hooks", { CLAUDE_CODE_SESSION_ID: SESSION });

      expect(await repo.messageOf("HEAD")).toContain(`${SESSION_TRAILER_TOKEN}: ${SESSION}`);
      expect(await readFile(join(repo.dir, ".git", "theirs.log"), "utf8")).toContain("theirs ran");
    });
  });
});

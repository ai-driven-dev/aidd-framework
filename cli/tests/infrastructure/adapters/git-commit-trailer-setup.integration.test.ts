import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  SESSION_TRAILER_TOKEN,
  sessionTrailerHookLine,
} from "../../../src/domain/formats/commit-session-trailer.js";
import { FileAdapter } from "../../../src/infrastructure/adapters/file-adapter.js";
import { GitAdapter } from "../../../src/infrastructure/adapters/git-adapter.js";
import { environmentWithoutGitVariables } from "../../../src/infrastructure/git-environment.js";
import { CapturingLogger } from "../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../helpers/ports/deterministic-hasher.js";

/**
 * The five facts `check` states about the trailer, read from a real repository.
 *
 * Against a real git rather than a fake one because every one of them is a git question, and
 * the two that matter most — where hooks are run from, and what the last commits actually
 * carry — are answers only git has. `%(trailers:key=…)` in particular is git's own reader:
 * asserting against a regex of ours would prove the regex agrees with itself.
 */
let dir: string;
let git: GitAdapter;

/** Git exports `GIT_DIR` and friends into everything it spawns, this suite included when it
 * runs from a commit hook. Stripped, or these read the repository being committed. */
function run(args: readonly string[], env: NodeJS.ProcessEnv = {}): void {
  execFileSync("git", [...args], {
    cwd: dir,
    env: { ...environmentWithoutGitVariables(process.env), ...env },
  });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aidd-trailer-setup-"));
  execFileSync("git", ["init", "-q", dir], { env: environmentWithoutGitVariables(process.env) });
  run(["config", "user.email", "t@example.com"]);
  run(["config", "user.name", "T"]);
  git = new GitAdapter(new FileAdapter(new DeterministicHasher(), new CapturingLogger()));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function read() {
  return git.readCommitTrailerSetup(dir, SESSION_TRAILER_DELEGATE_FILE, SESSION_TRAILER_TOKEN, 20);
}

async function hooksDir(): Promise<string> {
  const at = join(dir, ".git", "hooks");
  await mkdir(at, { recursive: true });
  return at;
}

async function installDelegate(mode = 0o755): Promise<string> {
  const at = join(await hooksDir(), SESSION_TRAILER_DELEGATE_FILE);
  await writeFile(at, "#!/bin/sh\nexit 0\n");
  await chmod(at, mode);
  return at;
}

function commit(message: string): void {
  run(["commit", "-q", "--allow-empty", "-m", message]);
}

function commitCarrying(message: string, session: string): void {
  run([
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    `${message}\n\n${SESSION_TRAILER_TOKEN}: ${session}`,
  ]);
}

describe("what check reads about the commit trailer", () => {
  it("names the directory git runs hooks from, not one assumed", async () => {
    expect((await read()).hooksDir).toContain(join(".git", "hooks"));
  });

  it("tells a delegate that is not executable from one that is absent", async () => {
    expect((await read()).delegate).toBe("absent");

    await installDelegate(0o644);
    expect((await read()).delegate).toBe("not-executable");

    await installDelegate(0o755);
    expect((await read()).delegate).toBe("executable");
  });

  it("says whether prepare-commit-msg calls the delegate", async () => {
    const delegatePath = await installDelegate();
    expect((await read()).callSite).toBe("no-hook-file");

    const hookPath = join(await hooksDir(), "prepare-commit-msg");
    await writeFile(hookPath, "#!/bin/sh\n# generated\nexit 0\n");
    expect((await read()).callSite).toBe("missing");

    await writeFile(hookPath, `#!/bin/sh\n${sessionTrailerHookLine(delegatePath)}\n`);
    expect((await read()).callSite).toBe("present");
  });

  // Said, never named: which tool owns the file changes nothing a person does.
  it("says the hook is somebody else's, and does not say whose", async () => {
    const delegatePath = await installDelegate();
    const hookPath = join(await hooksDir(), "prepare-commit-msg");

    await writeFile(hookPath, `#!/bin/sh\n${sessionTrailerHookLine(delegatePath)}\n`);
    expect((await read()).hookHasOtherContent).toBe(false);

    await writeFile(
      hookPath,
      `#!/bin/sh\nlefthook run x\n${sessionTrailerHookLine(delegatePath)}\n`
    );
    expect((await read()).hookHasOtherContent).toBe(true);
  });

  /**
   * The only claim about the chain rather than its parts, and the reason it is a count.
   * "Some of your commits carry it" is not something a person can check; "0 of the last 3"
   * in a repository that has been measuring all week is the entire finding.
   */
  it("counts how many recent commits actually carry it", async () => {
    commit("one");
    commitCarrying("two", "s-1");
    commitCarrying("three", "s-2");

    expect((await read()).recentlyCarrying).toEqual({ carrying: 2, examined: 3 });
  });

  /**
   * A merge carries no trailer by the delegate's own design — one session's id on a merge
   * would attribute every commit it brings in to that session. Counting them puts commits in
   * the denominator that can never be in the numerator, which is arithmetic that reads as
   * breakage on a healthy install.
   */
  it("does not count merges, which can never carry it", async () => {
    commitCarrying("one", "s-1");
    run(["checkout", "-q", "-b", "side"]);
    commitCarrying("side", "s-2");
    run(["checkout", "-q", "-"]);
    commitCarrying("main", "s-3");
    run(["merge", "-q", "--no-ff", "-m", "merge", "side"]);

    const counted = (await read()).recentlyCarrying;

    expect(counted).toEqual({ carrying: 3, examined: 3 });
  });

  // Never `0`: a repository with no commits and one whose commits are all unstamped are
  // different facts, and only the second is something to act on.
  it("reports no history rather than zero when there are no commits", async () => {
    expect((await read()).recentlyCarrying).toBeUndefined();
  });

  /**
   * Outside a repository, and said as such. The distinction existed in the type and in two
   * display fixtures and was produced by nothing — so `check` printed "git could not say
   * where it runs hooks from" beside its own "not a git repository" line, one of them false.
   * Asserted through the real adapter, because that is where it was missing.
   */
  it("says there is no repository, rather than that git could not answer", async () => {
    const outside = await mkdtemp(join(tmpdir(), "aidd-trailer-nogit-"));
    try {
      const setup = await git.readCommitTrailerSetup(
        outside,
        SESSION_TRAILER_DELEGATE_FILE,
        SESSION_TRAILER_TOKEN,
        20
      );

      expect(setup.hooksDirMissing).toBe("no-repository");
      expect(setup.recentlyCarrying).toBeUndefined();
      expect(setup.delegate).toBe("absent");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  // Git refuses to run a hook without the bit and prints a hint on every commit, so an
  // install that looks perfect can write nothing. The hook's own mode, not the delegate's.
  it("says whether the hook itself is executable", async () => {
    const delegatePath = await installDelegate();
    const hookPath = join(await hooksDir(), "prepare-commit-msg");
    await writeFile(hookPath, `#!/bin/sh\n${sessionTrailerHookLine(delegatePath)}\n`);

    await chmod(hookPath, 0o644);
    expect((await read()).hookExecutable).toBe(false);

    await chmod(hookPath, 0o755);
    expect((await read()).hookExecutable).toBe(true);
  });

  it("has no opinion on a hook's mode when there is no hook", async () => {
    await installDelegate();

    expect((await read()).hookExecutable).toBeUndefined();
  });
});

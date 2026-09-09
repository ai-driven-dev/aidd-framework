import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  SESSION_TRAILER_TOKEN,
  sessionTrailerHookLine,
} from "../../../../src/contexts/telemetry/domain/formats/commit-session-trailer.js";
import { FileAdapter } from "../../../../src/runtime/filesystem/file-adapter.js";
import { GitAdapter } from "../../../../src/runtime/git/git-adapter.js";
import { environmentWithoutGitVariables } from "../../../../src/runtime/git/git-environment.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";

/** Against a real git rather than a fake one: `%(trailers:key=…)` is git's own reader, and
 * asserting against a regex of ours would prove only that the regex agrees with itself. */
let dir: string;
let git: GitAdapter;

/** Windows records no execute bit: every readable file reports `0o666`, so "present but
 * unrunnable" is a state that exists only where the bit does. */
const REMOVING_THE_BIT_MEANS_SOMETHING = process.platform !== "win32";

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

    if (REMOVING_THE_BIT_MEANS_SOMETHING) {
      await installDelegate(0o644);
      expect((await read()).delegate).toBe("not-executable");
    }

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

  /** A count, not a boolean: "some of your commits carry it" is not something a person can
   * check, while "0 of the last 3" is the entire finding. */
  it("counts how many recent commits actually carry it", async () => {
    commit("one");
    commitCarrying("two", "s-1");
    commitCarrying("three", "s-2");

    expect((await read()).recentlyCarrying).toEqual({ carrying: 2, examined: 3 });
  });

  /** A merge carries no trailer by the delegate's own design, so counting one puts a commit
   * in the denominator that can never be in the numerator. */
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

    if (REMOVING_THE_BIT_MEANS_SOMETHING) {
      await chmod(hookPath, 0o644);
      expect((await read()).hookExecutable).toBe(false);
    }

    await chmod(hookPath, 0o755);
    expect((await read()).hookExecutable).toBe(true);
  });

  it("has no opinion on a hook's mode when there is no hook", async () => {
    await installDelegate();

    expect((await read()).hookExecutable).toBeUndefined();
  });
});

/** A manager regenerates `prepare-commit-msg` from its own config on every install, so
 * anything read from the hook itself is already stale; the root marker file survives that. */
describe("which manager owns prepare-commit-msg, read from the repository root", () => {
  it("names lefthook from lefthook.yml alone, before lefthook has ever generated a hook", async () => {
    await writeFile(join(dir, "lefthook.yml"), "prepare-commit-msg:\n  commands: {}\n");

    const setup = await read();

    expect(setup.hookManager).toBe("lefthook");
    expect(setup.callSite).toBe("no-hook-file");
  });

  it("names lefthook even once a hook file exists, never reading that file to decide", async () => {
    await writeFile(join(dir, "lefthook.yml"), "prepare-commit-msg:\n  commands: {}\n");
    const hookPath = join(await hooksDir(), "prepare-commit-msg");
    // What lefthook itself regenerates: no aidd trailer line and no mention of lefthook, so a
    // reader deciding from the hook's own contents would have nothing here to key off.
    await writeFile(hookPath, "#!/bin/sh\nexit 0\n");

    expect((await read()).hookManager).toBe("lefthook");
  });

  it("names husky from a .husky directory at the root", async () => {
    await mkdir(join(dir, ".husky"), { recursive: true });

    expect((await read()).hookManager).toBe("husky");
  });

  it("names neither manager when no marker sits at the root", async () => {
    expect((await read()).hookManager).toBeUndefined();
  });
});

/** This repository's own lefthook job, inlined rather than read off disk: it calls the
 * delegate through the dynamic form, never the absolute-path `sessionTrailerHookLine` one. */
const REAL_LEFTHOOK_PREPARE_COMMIT_MSG_JOB = `prepare-commit-msg:
  commands:
    aidd-session-trailer:
      run: |
        delegate="$(git rev-parse --git-common-dir)/hooks/aidd-session-trailer.sh"
        if [ -f "$delegate" ]; then sh "$delegate" {1} {2}; fi
`;

describe("whether the manager's own config already calls the delegate", () => {
  it("reports not wired when lefthook.yml exists but names no job for it", async () => {
    await writeFile(join(dir, "lefthook.yml"), "commit-msg:\n  commands: {}\n");

    expect((await read()).managerCallsDelegate).toBe(false);
  });

  it("reports wired against this repository's own lefthook.yml job", async () => {
    await writeFile(join(dir, "lefthook.yml"), REAL_LEFTHOOK_PREPARE_COMMIT_MSG_JOB);

    const setup = await read();

    expect(setup.hookManager).toBe("lefthook");
    expect(setup.managerCallsDelegate).toBe(true);
  });

  it("reports wired from .husky/prepare-commit-msg the same way", async () => {
    await mkdir(join(dir, ".husky"), { recursive: true });
    await writeFile(
      join(dir, ".husky", "prepare-commit-msg"),
      'delegate="$(git rev-parse --git-common-dir)/hooks/aidd-session-trailer.sh"\n' +
        '[ -f "$delegate" ] && sh "$delegate" "$@"\n'
    );

    expect((await read()).managerCallsDelegate).toBe(true);
  });
});

/** Husky moves `core.hooksPath` under `.husky/` while `on` writes the delegate to the common
 * git dir, so following `core.hooksPath` reads it "absent" however often `on` ran. */
describe("reading the delegate's own state under a manager that moves core.hooksPath", () => {
  it("finds the delegate in the common git dir, not wherever core.hooksPath points", async () => {
    await mkdir(join(dir, ".husky"), { recursive: true });
    run(["config", "core.hooksPath", ".husky"]);
    const commonHooks = join(dir, ".git", "hooks");
    await mkdir(commonHooks, { recursive: true });
    const delegatePath = join(commonHooks, SESSION_TRAILER_DELEGATE_FILE);
    await writeFile(delegatePath, "#!/bin/sh\nexit 0\n");
    await chmod(delegatePath, 0o755);

    const setup = await read();

    expect(setup.hookManager).toBe("husky");
    expect(setup.delegate).toBe("executable");
  });

  it("reports the delegate not-executable rather than absent, under the same divergence", async () => {
    if (!REMOVING_THE_BIT_MEANS_SOMETHING) return;
    await mkdir(join(dir, ".husky"), { recursive: true });
    run(["config", "core.hooksPath", ".husky"]);
    const commonHooks = join(dir, ".git", "hooks");
    await mkdir(commonHooks, { recursive: true });
    const delegatePath = join(commonHooks, SESSION_TRAILER_DELEGATE_FILE);
    await writeFile(delegatePath, "#!/bin/sh\nexit 0\n");
    await chmod(delegatePath, 0o644);

    expect((await read()).delegate).toBe("not-executable");
  });
});

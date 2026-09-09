import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  sessionTrailerDelegateScript,
  sessionTrailerHookLine,
} from "../../../../src/contexts/telemetry/domain/formats/commit-session-trailer.js";
import { FileAdapter } from "../../../../src/runtime/filesystem/file-adapter.js";
import { HasherAdapter } from "../../../../src/runtime/filesystem/hasher-adapter.js";
import { GitAdapter } from "../../../../src/runtime/git/git-adapter.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";

/**
 * The real adapter against real repositories: where git looks for a hook is not knowable
 * from the shape of `.git` alone — `core.hooksPath` and a linked worktree each move it.
 */
const created: string[] = [];

function gitEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: gitEnv() });
}

function makeRepo(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `aidd-trailer-${prefix}-`));
  created.push(dir);
  git(dir, "init", "-q", ".");
  return dir;
}

function adapter(): GitAdapter {
  return new GitAdapter(new FileAdapter(new HasherAdapter(), new CapturingLogger()));
}

afterEach(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  created.length = 0;
});

describe("installing the trailer hook where git will actually run it", () => {
  it("installs into a plain repository, and says it did", async () => {
    const repo = makeRepo("plain");

    const installed = await adapter().installCommitMessageDelegate(
      repo,
      SESSION_TRAILER_DELEGATE_FILE,
      sessionTrailerDelegateScript()
    );

    const hooks = join(repo, ".git", "hooks");
    expect(installed).toEqual({ lineAdded: true });
    expect(readFileSync(join(hooks, "prepare-commit-msg"), "utf8")).toContain(
      sessionTrailerHookLine(join(hooks, SESSION_TRAILER_DELEGATE_FILE))
    );
    expect(existsSync(join(hooks, SESSION_TRAILER_DELEGATE_FILE))).toBe(true);
  });

  // `.git/hooks` is not where git looks when a `core.hooksPath` is set, and a hook written
  // there runs on nothing while reporting success.
  it("installs where core.hooksPath points, never into .git/hooks it would ignore", async () => {
    const repo = makeRepo("hookspath");
    const elsewhere = join(repo, "team-hooks");
    mkdirSync(elsewhere, { recursive: true });
    git(repo, "config", "core.hooksPath", elsewhere);

    await adapter().installCommitMessageDelegate(
      repo,
      SESSION_TRAILER_DELEGATE_FILE,
      sessionTrailerDelegateScript()
    );

    expect(existsSync(join(elsewhere, "prepare-commit-msg"))).toBe(true);
    expect(existsSync(join(repo, ".git", "hooks", "prepare-commit-msg"))).toBe(false);
  });

  it("installs into the common repository's hooks from inside a linked worktree", async () => {
    const repo = makeRepo("worktree");
    writeFileSync(join(repo, "seed.txt"), "seed\n");
    git(repo, "add", "seed.txt");
    git(repo, "-c", "user.email=t@example.com", "-c", "user.name=T", "commit", "-q", "-m", "seed");
    const linked = join(repo, "linked");
    git(repo, "worktree", "add", "-q", linked);

    await adapter().installCommitMessageDelegate(
      linked,
      SESSION_TRAILER_DELEGATE_FILE,
      sessionTrailerDelegateScript()
    );

    expect(existsSync(join(repo, ".git", "hooks", "prepare-commit-msg"))).toBe(true);
  });

  it("keeps a hook the repository already had, and adds one line to it", async () => {
    const repo = makeRepo("existing");
    const hooks = join(repo, ".git", "hooks");
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, "prepare-commit-msg"), "#!/bin/sh\necho theirs\n");

    await adapter().installCommitMessageDelegate(
      repo,
      SESSION_TRAILER_DELEGATE_FILE,
      sessionTrailerDelegateScript()
    );

    const content = readFileSync(join(hooks, "prepare-commit-msg"), "utf8");
    expect(content).toContain("echo theirs");
    expect(content).toContain(sessionTrailerHookLine(join(hooks, SESSION_TRAILER_DELEGATE_FILE)));
  });

  it("adds its line once however often it is installed", async () => {
    const repo = makeRepo("twice");

    const first = await adapter().installCommitMessageDelegate(
      repo,
      SESSION_TRAILER_DELEGATE_FILE,
      sessionTrailerDelegateScript()
    );
    const second = await adapter().installCommitMessageDelegate(
      repo,
      SESSION_TRAILER_DELEGATE_FILE,
      sessionTrailerDelegateScript()
    );

    const content = readFileSync(join(repo, ".git", "hooks", "prepare-commit-msg"), "utf8");
    expect(first).toEqual({ lineAdded: true });
    expect(second).toEqual({ lineAdded: false });
    expect(content.split("aidd-session-trailer.sh").length - 1).toBe(1);
  });

  it("reports nothing installed outside a repository, rather than failing", async () => {
    const notARepo = mkdtempSync(join(tmpdir(), "aidd-trailer-none-"));
    created.push(notARepo);

    await expect(
      adapter().installCommitMessageDelegate(
        notARepo,
        SESSION_TRAILER_DELEGATE_FILE,
        sessionTrailerDelegateScript()
      )
    ).resolves.toEqual({ lineAdded: false });
  });

  // A lefthook marker outside a git repository has no `$(git rev-parse --git-common-dir)`
  // for a hand-added job to resolve against, so naming a manager there prints a dead job.
  it("names no manager outside a repository, even with a lefthook marker at the root", async () => {
    const notARepo = mkdtempSync(join(tmpdir(), "aidd-trailer-lefthook-nogit-"));
    created.push(notARepo);
    writeFileSync(join(notARepo, "lefthook.yml"), "prepare-commit-msg:\n  commands: {}\n");

    await expect(
      adapter().installCommitMessageDelegate(
        notARepo,
        SESSION_TRAILER_DELEGATE_FILE,
        sessionTrailerDelegateScript()
      )
    ).resolves.toEqual({ lineAdded: false });
  });
});

/**
 * Neither `lefthook.yml` nor `.husky/*` is ever written by this CLI, yet the delegate must
 * land at `$(git rev-parse --git-common-dir)/hooks`, which husky's `core.hooksPath` misses.
 */
describe("installing where lefthook or husky already owns prepare-commit-msg", () => {
  it("reports the manager, writes no line, and touches nothing lefthook owns", async () => {
    const repo = makeRepo("lefthook-owned");
    writeFileSync(join(repo, "lefthook.yml"), "prepare-commit-msg:\n  commands: {}\n");

    const result = await adapter().installCommitMessageDelegate(
      repo,
      SESSION_TRAILER_DELEGATE_FILE,
      sessionTrailerDelegateScript()
    );

    expect(result).toEqual({
      hookManager: "lefthook",
      managerCallsDelegate: false,
      lineAdded: false,
    });
    expect(existsSync(join(repo, ".git", "hooks", "prepare-commit-msg"))).toBe(false);
    expect(readFileSync(join(repo, "lefthook.yml"), "utf8")).toBe(
      "prepare-commit-msg:\n  commands: {}\n"
    );
    expect(existsSync(join(repo, ".git", "hooks", SESSION_TRAILER_DELEGATE_FILE))).toBe(true);
  });

  it("writes the delegate to the common git dir, never to husky's own core.hooksPath", async () => {
    const repo = makeRepo("husky-owned");
    mkdirSync(join(repo, ".husky"), { recursive: true });
    writeFileSync(join(repo, ".husky", "prepare-commit-msg"), "#!/bin/sh\necho theirs\n");
    git(repo, "config", "core.hooksPath", ".husky");

    const result = await adapter().installCommitMessageDelegate(
      repo,
      SESSION_TRAILER_DELEGATE_FILE,
      sessionTrailerDelegateScript()
    );

    expect(result).toEqual({ hookManager: "husky", managerCallsDelegate: false, lineAdded: false });
    expect(readFileSync(join(repo, ".husky", "prepare-commit-msg"), "utf8")).toBe(
      "#!/bin/sh\necho theirs\n"
    );
    expect(existsSync(join(repo, ".husky", SESSION_TRAILER_DELEGATE_FILE))).toBe(false);
    expect(existsSync(join(repo, ".git", "hooks", SESSION_TRAILER_DELEGATE_FILE))).toBe(true);
  });
});

describe("removing it again", () => {
  it("takes back its own line and its own file, and says it did", async () => {
    const repo = makeRepo("remove");
    await adapter().installCommitMessageDelegate(
      repo,
      SESSION_TRAILER_DELEGATE_FILE,
      sessionTrailerDelegateScript()
    );

    const removed = await adapter().removeCommitMessageDelegate(
      repo,
      SESSION_TRAILER_DELEGATE_FILE
    );

    const hooks = join(repo, ".git", "hooks");
    expect(removed).toEqual({ removed: true });
    expect(readFileSync(join(hooks, "prepare-commit-msg"), "utf8")).not.toContain(
      SESSION_TRAILER_DELEGATE_FILE
    );
    expect(existsSync(join(hooks, SESSION_TRAILER_DELEGATE_FILE))).toBe(false);
  });

  it("leaves every other line of somebody else's hook exactly as it found it", async () => {
    const repo = makeRepo("shared");
    const hooks = join(repo, ".git", "hooks");
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, "prepare-commit-msg"), "#!/bin/sh\necho theirs\nexit 0\n");
    await adapter().installCommitMessageDelegate(
      repo,
      SESSION_TRAILER_DELEGATE_FILE,
      sessionTrailerDelegateScript()
    );

    await adapter().removeCommitMessageDelegate(repo, SESSION_TRAILER_DELEGATE_FILE);

    expect(readFileSync(join(hooks, "prepare-commit-msg"), "utf8")).toBe(
      "#!/bin/sh\necho theirs\nexit 0\n"
    );
  });

  it("reports nothing to remove when it was never installed", async () => {
    const repo = makeRepo("never");

    await expect(
      adapter().removeCommitMessageDelegate(repo, SESSION_TRAILER_DELEGATE_FILE)
    ).resolves.toEqual({ removed: false });
  });

  /** Once a manager owns `prepare-commit-msg`, `on` writes the delegate to
   * `$(git rev-parse --git-common-dir)/hooks`, ignoring `core.hooksPath`; `off` must agree. */
  it("removes the delegate on and off agree on, even where husky moves core.hooksPath", async () => {
    const repo = makeRepo("husky-remove");
    mkdirSync(join(repo, ".husky"), { recursive: true });
    writeFileSync(join(repo, ".husky", "prepare-commit-msg"), "#!/bin/sh\necho theirs\n");
    git(repo, "config", "core.hooksPath", ".husky");
    await adapter().installCommitMessageDelegate(
      repo,
      SESSION_TRAILER_DELEGATE_FILE,
      sessionTrailerDelegateScript()
    );
    expect(existsSync(join(repo, ".git", "hooks", SESSION_TRAILER_DELEGATE_FILE))).toBe(true);

    const removed = await adapter().removeCommitMessageDelegate(
      repo,
      SESSION_TRAILER_DELEGATE_FILE
    );

    expect(removed).toEqual({ removed: true, hookManager: "husky", managerCallsDelegate: false });
    expect(existsSync(join(repo, ".git", "hooks", SESSION_TRAILER_DELEGATE_FILE))).toBe(false);
    // husky's own hook file is not aidd's to touch, on the way in or on the way out.
    expect(readFileSync(join(repo, ".husky", "prepare-commit-msg"), "utf8")).toBe(
      "#!/bin/sh\necho theirs\n"
    );
  });
});

/**
 * A resumed Codex rollout carries a `session_meta.id` — what becomes a record's `vendor_id`
 * — different from its own `session_meta.session_id`: thread and rollout are two things.
 */
describe("the reason the Codex half of this join is only a candidate", () => {
  it("still holds a resumed rollout whose own id differs from the session it continues", () => {
    const rollout = fileURLToPath(
      new URL(
        "../../../fixtures/local-cost/.codex/sessions/2026/07/29/" +
          "rollout-2026-07-29T17-12-26-019fae6f-2009-7cd3-86b2-b8f83481b160.jsonl",
        import.meta.url
      )
    );
    const first = readFileSync(rollout, "utf8").split("\n")[0] ?? "";
    const meta = JSON.parse(first) as {
      payload?: { id?: string; session_id?: string };
    };

    expect(meta.payload?.id).toBe("019fae6f-2009-7cd3-86b2-b8f83481b160");
    expect(meta.payload?.session_id).toBeDefined();
    expect(meta.payload?.session_id).not.toBe(meta.payload?.id);
  });
});

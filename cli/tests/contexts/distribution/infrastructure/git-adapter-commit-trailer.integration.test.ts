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
 * The real adapter against real repositories, because the whole question is where git looks
 * for a hook — which is not knowable from the shape of `.git` alone. A `core.hooksPath` and
 * a linked worktree each move it somewhere the obvious answer does not point, and in both
 * cases a hook installed at the obvious place is silently never run.
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
    expect(installed).toBe(true);
    expect(readFileSync(join(hooks, "prepare-commit-msg"), "utf8")).toContain(
      sessionTrailerHookLine(join(hooks, SESSION_TRAILER_DELEGATE_FILE))
    );
    expect(existsSync(join(hooks, SESSION_TRAILER_DELEGATE_FILE))).toBe(true);
  });

  // The defect this test exists for: `.git/hooks` is not where git looks when a
  // `core.hooksPath` is set, and a hook written there runs on nothing while reporting
  // success. This machine's own checkout is configured exactly this way.
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
    expect(first).toBe(true);
    expect(second).toBe(false);
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
    ).resolves.toBe(false);
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
    expect(removed).toBe(true);
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
    ).resolves.toBe(false);
  });
});

/**
 * The evidence behind a stated limit, pinned so the limit cannot quietly stop being true.
 *
 * `commit-session-trailer.ts` and the metrics contract both say the commit-to-session join
 * is measured on Claude Code and unconfirmed on Codex, and give a concrete reason: a resumed
 * Codex rollout carries a `session_meta.id` — which is what becomes a record's `vendor_id` —
 * different from its own `session_meta.session_id`, so "the thread" and "the rollout" are
 * demonstrably two things there. If the captured rollout were replaced by one where they
 * agree, that reason would evaporate while both documents went on giving it.
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

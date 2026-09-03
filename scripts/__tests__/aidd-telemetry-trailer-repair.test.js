const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repo = path.resolve(__dirname, "../..");
const HOOK = path.join(repo, "plugins", "aidd-telemetry", "hooks", "journal.cjs");
const DELEGATE = "aidd-session-trailer.sh";
const SESSION = "33333333-3333-4333-8333-333333333333";

/** Git exports `GIT_DIR`, `GIT_INDEX_FILE` and friends into everything it spawns, hooks
 * included — so under `lefthook run pre-commit` this file's own `git init` and `rev-parse`
 * would answer for the repository being committed rather than the temporary one. Stripped,
 * or these tests pass when run by hand and fail only inside a commit, which is the least
 * useful moment for them to be wrong. */
const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))
);

/**
 * The trailer's call site, put back after something removed it.
 *
 * Every case here reproduces the failure by its **shape** — a `prepare-commit-msg` replaced
 * between two commits — and never by its brand. Nothing installs lefthook or husky, and
 * nothing here names them: the repair asks only whether the line is there, so a test that
 * needed a particular tool would be testing something narrower than the code.
 */
function withRepo(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-trailer-repair-"));
  try {
    spawnSync("git", ["init", "-q", "."], { cwd: root, env: CLEAN_ENV });
    fs.mkdirSync(path.join(root, ".aidd"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".aidd", "config.json"),
      JSON.stringify({ telemetry: { enabled: true } })
    );
    // Resolved the way the hook resolves it — through git, from git's own idea of the root.
    // Not `path.resolve(root, …)`: on macOS `root` is under `/var`, a symlink to
    // `/private/var`, and git answers with the resolved form. The hook writes the path git
    // gave it, so a test comparing against the unresolved one fails on a correct repair.
    const [gitRoot, hooks] = String(
      spawnSync("git", ["rev-parse", "--show-toplevel", "--git-path", "hooks"], {
        cwd: root,
        encoding: "utf8",
        env: CLEAN_ENV,
      }).stdout
    )
      .split("\n")
      .map((part) => part.trim());
    const absoluteHooks = path.resolve(gitRoot, hooks);
    fs.mkdirSync(absoluteHooks, { recursive: true });
    run({ root, hooksDir: absoluteHooks });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function installDelegate(hooksDir) {
  const delegatePath = path.join(hooksDir, DELEGATE);
  fs.writeFileSync(delegatePath, "#!/bin/sh\nexit 0\n");
  fs.chmodSync(delegatePath, 0o755);
  return `sh "${delegatePath.replace(/\\/gu, "/")}" "$@"`;
}

/** A regeneration, reproduced: the file a person's other tool owns, replaced whole. */
function regenerateHook(hooksDir) {
  fs.writeFileSync(
    path.join(hooksDir, "prepare-commit-msg"),
    "#!/bin/sh\n# generated — do not edit\nexit 0\n"
  );
  fs.chmodSync(path.join(hooksDir, "prepare-commit-msg"), 0o755);
}

function sessionStart(root, event = "session-start") {
  return spawnSync(process.execPath, [HOOK, event], {
    cwd: root,
    encoding: "utf8",
        // Claude Code's own shape: the host is recognised by its transcript path living under
    // `/projects/`, which is what `hooks/lib/host.cjs` matches on.
    input: JSON.stringify({
      session_id: SESSION,
      cwd: root,
      transcript_path: `/home/dev/.claude/projects/-repo/${SESSION}.jsonl`,
      hook_event_name: "SessionStart",
      source: "startup",
    }),
    env: {
      ...CLEAN_ENV,
      HOME: path.join(root, "home"),
      AIDD_RUNS_DIR: path.join(root, "runs"),
    },
  });
}

function hookText(hooksDir) {
  const at = path.join(hooksDir, "prepare-commit-msg");
  return fs.existsSync(at) ? fs.readFileSync(at, "utf8") : null;
}

test("a hook another tool regenerated calls the delegate again after the next session", () => {
  withRepo(({ root, hooksDir }) => {
    const line = installDelegate(hooksDir);
    regenerateHook(hooksDir);
    assert.equal(hookText(hooksDir).includes(line), false, "the regeneration must have erased it");

    assert.equal(sessionStart(root).status, 0);

    const after = hookText(hooksDir);
    assert.ok(after.includes(line), "the call site is back");
    assert.ok(after.includes("# generated — do not edit"), "and everything else is kept");
  });
});

test("a hook that never existed is created with the call site", () => {
  withRepo(({ root, hooksDir }) => {
    const line = installDelegate(hooksDir);

    assert.equal(sessionStart(root).status, 0);

    assert.ok(hookText(hooksDir).includes(line));
  });
});

// `aidd telemetry off` deletes the delegate. Nothing may resurrect what off removed.
test("nothing is written when no delegate is installed", () => {
  withRepo(({ root, hooksDir }) => {
    regenerateHook(hooksDir);
    const before = hookText(hooksDir);

    assert.equal(sessionStart(root).status, 0);

    assert.equal(hookText(hooksDir), before);
  });
});

test("a hook that already calls the delegate is left byte for byte alone", () => {
  withRepo(({ root, hooksDir }) => {
    const line = installDelegate(hooksDir);
    fs.writeFileSync(path.join(hooksDir, "prepare-commit-msg"), `#!/bin/sh\n${line}\n`);
    const before = hookText(hooksDir);

    assert.equal(sessionStart(root).status, 0);

    assert.equal(hookText(hooksDir), before);
  });
});

// `tool-used` fires on every tool call. The journal already draws this line for its own
// unrecognised-payload path, with the cost written down; the repair inherits it.
test("tool-used never repairs, whatever is missing", () => {
  withRepo(({ root, hooksDir }) => {
    const line = installDelegate(hooksDir);
    regenerateHook(hooksDir);

    assert.equal(sessionStart(root, "tool-used").status, 0);

    assert.equal(hookText(hooksDir).includes(line), false);
  });
});

// A repository that never turned measurement on is not one to write hooks into.
test("nothing is written when measurement is off for the project", () => {
  withRepo(({ root, hooksDir }) => {
    fs.writeFileSync(
      path.join(root, ".aidd", "config.json"),
      JSON.stringify({ telemetry: { enabled: false } })
    );
    const line = installDelegate(hooksDir);
    regenerateHook(hooksDir);

    assert.equal(sessionStart(root).status, 0);

    assert.equal(hookText(hooksDir).includes(line), false);
  });
});

// The hook must never turn a person's session into an error over a file it could not write.
test("an unwritable hook file costs the session nothing", () => {
  withRepo(({ root, hooksDir }) => {
    installDelegate(hooksDir);
    const hookPath = path.join(hooksDir, "prepare-commit-msg");
    fs.writeFileSync(hookPath, "#!/bin/sh\n");
    fs.chmodSync(hookPath, 0o444);
    try {
      assert.equal(sessionStart(root).status, 0);
    } finally {
      fs.chmodSync(hookPath, 0o644);
    }
  });
});

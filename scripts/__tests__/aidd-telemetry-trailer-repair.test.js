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
function withRepo(run, nested = "") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-trailer-repair-"));
  try {
    spawnSync("git", ["init", "-q", "."], { cwd: root, env: CLEAN_ENV });
    const sessionCwd = nested === "" ? root : path.join(root, nested);
    fs.mkdirSync(sessionCwd, { recursive: true });
    fs.mkdirSync(path.join(root, ".aidd"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".aidd", "config.json"),
      JSON.stringify({ telemetry: { enabled: true } })
    );
    // Resolved against the cwd the hook is given, which is what the hook itself does — git
    // prints `--git-path` relative to the directory it ran in. Pinning it here is the point:
    // an earlier version resolved against the repository root instead, and a session started
    // in a subdirectory then repaired a hooks directory two levels ABOVE the checkout. Every
    // case below runs from `root`, where both bases coincide, so `withRepo` takes the cwd the
    // session will use and the nested case supplies a different one.
    const hooks = String(
      spawnSync("git", ["rev-parse", "--git-path", "hooks"], {
        cwd: sessionCwd,
        encoding: "utf8",
        env: CLEAN_ENV,
      }).stdout
    ).trim();
    const absoluteHooks = path.resolve(sessionCwd, hooks);
    fs.mkdirSync(absoluteHooks, { recursive: true });
    run({ root, sessionCwd, hooksDir: absoluteHooks });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function installDelegate(hooksDir) {
  const delegatePath = path.join(hooksDir, DELEGATE);
  fs.writeFileSync(delegatePath, "#!/bin/sh\nexit 0\n");
  fs.chmodSync(delegatePath, 0o755);
  // The physical path, because that is what the repair writes: it builds the line from the
  // realpath its own containment guard approved, so a line built here from the unresolved
  // spelling would differ on any machine whose temp directory is reached through a link —
  // every macOS one, where `/var` is a link to `/private/var`.
  const resolved = path.join(fs.realpathSync(hooksDir), DELEGATE);
  return `sh "${resolved.replace(/\\/gu, "/")}" "$@"`;
}

/** A regeneration, reproduced: the file a person's other tool owns, replaced whole. */
function regenerateHook(hooksDir) {
  fs.writeFileSync(
    path.join(hooksDir, "prepare-commit-msg"),
    "#!/bin/sh\n# generated — do not edit\nexit 0\n"
  );
  fs.chmodSync(path.join(hooksDir, "prepare-commit-msg"), 0o755);
}

function sessionStart(cwd, event = "session-start") {
  return spawnSync(process.execPath, [HOOK, event], {
    cwd,
    encoding: "utf8",
        // Claude Code's own shape: the host is recognised by its transcript path living under
    // `/projects/`, which is what `hooks/lib/host.cjs` matches on.
    input: JSON.stringify({
      session_id: SESSION,
      cwd,
      transcript_path: `/home/dev/.claude/projects/-repo/${SESSION}.jsonl`,
      hook_event_name: "SessionStart",
      source: "startup",
    }),
    env: {
      ...CLEAN_ENV,
      HOME: path.join(cwd, "aidd-home"),
      AIDD_RUNS_DIR: path.join(cwd, "aidd-runs"),
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

/**
 * A file the filesystem says cannot be written is left exactly as it is, and the session
 * survives. `rename` needs the *directory*, not the file, so without an explicit check a
 * `0444` hook was silently replaced and left reading `0444` — its content changed while its
 * permissions said it could not be. The old test asserted only that the session exited 0,
 * which was true either way.
 */
test("an unwritable hook file is left alone, and costs the session nothing", () => {
  withRepo(({ root, hooksDir }) => {
    installDelegate(hooksDir);
    const hookPath = path.join(hooksDir, "prepare-commit-msg");
    fs.writeFileSync(hookPath, "#!/bin/sh\n# theirs\n");
    const before = fs.readFileSync(hookPath, "utf8");
    fs.chmodSync(hookPath, 0o444);
    try {
      assert.equal(sessionStart(root).status, 0);
      assert.equal(fs.readFileSync(hookPath, "utf8"), before);
    } finally {
      fs.chmodSync(hookPath, 0o644);
    }
  });
});

// `open(2)` applies the umask to the mode it is handed, so a staged write narrowed a `0770`
// hook to `0750`. Narrowing is as much a change to somebody else's file as widening.
//
// Asserted as "the mode the repair found is the mode it left", never against a literal:
// Windows has no POSIX permission bits, and reports `0o666` for every writable file
// whatever it was chmod'ed to. The literal made this fail there for a reason that was
// about the platform and not about the repair.
test("a repair does not narrow a hook's group permissions", () => {
  withRepo(({ root, hooksDir }) => {
    installDelegate(hooksDir);
    const hookPath = path.join(hooksDir, "prepare-commit-msg");
    fs.writeFileSync(hookPath, "#!/bin/sh\n# generated\n");
    fs.chmodSync(hookPath, 0o770);
    const before = fs.statSync(hookPath).mode & 0o777;

    assert.equal(sessionStart(root).status, 0);

    assert.equal(fs.statSync(hookPath).mode & 0o777, before);
  });
});

/**
 * The atomicity criterion, asserted on the one thing only `rename` produces: a different
 * inode. A direct `writeFileSync` truncates and refills the file it already has, so the
 * inode survives; staging beside the target and renaming over it replaces it.
 *
 * This exists because the criterion had no test that could fail — removing the
 * stage-and-rename branch entirely left every other case green, and a test asserting only
 * that no staging file remains is equally true when nothing is ever staged.
 */
test("a repair replaces the hook rather than truncating it, so no reader sees it half-written", () => {
  withRepo(({ root, hooksDir }) => {
    installDelegate(hooksDir);
    const hookPath = path.join(hooksDir, "prepare-commit-msg");
    fs.writeFileSync(hookPath, "#!/bin/sh\n# generated\n");
    const before = fs.statSync(hookPath).ino;

    assert.equal(sessionStart(root).status, 0);

    assert.notEqual(fs.statSync(hookPath).ino, before);
  });
});

test("a hooks directory that is a symlink into the working tree is never written to", () => {
  withRepo(({ root }) => {
    const shared = path.join(root, ".githooks");
    fs.mkdirSync(shared, { recursive: true });
    fs.writeFileSync(path.join(shared, DELEGATE), "#!/bin/sh\nexit 0\n");
    fs.chmodSync(path.join(shared, DELEGATE), 0o755);
    const teamHook = path.join(shared, "prepare-commit-msg");
    fs.writeFileSync(teamHook, "#!/bin/sh\n# the team's own\nexit 0\n");
    const before = fs.readFileSync(teamHook, "utf8");
    fs.rmSync(path.join(root, ".git", "hooks"), { recursive: true, force: true });
    fs.symlinkSync(path.join("..", ".githooks"), path.join(root, ".git", "hooks"));

    assert.equal(sessionStart(root).status, 0);

    assert.equal(fs.readFileSync(teamHook, "utf8"), before);
  });
});

// `rename` replaces the inode, so without carrying the mode across a `0700` hook would come
// back `0755` — widening a third party's file on a path meant to be conservative. Compared
// against the mode found rather than a literal, for the reason the narrowing case gives.
test("a repair keeps the hook's own permissions rather than widening them", () => {
  withRepo(({ root, hooksDir }) => {
    installDelegate(hooksDir);
    const hookPath = path.join(hooksDir, "prepare-commit-msg");
    fs.writeFileSync(hookPath, "#!/bin/sh\n# generated\n");
    fs.chmodSync(hookPath, 0o700);
    const before = fs.statSync(hookPath).mode & 0o777;

    assert.equal(sessionStart(root).status, 0);

    assert.equal(fs.statSync(hookPath).mode & 0o777, before);
  });
});

/**
 * Staging beside the target needs write permission on the *directory*, where a direct write
 * needs it only on the file. A `0555` hooks directory holding a writable hook was repairable
 * before the atomic write existed, so the direct write is kept as the fallback rather than
 * the capability being quietly dropped.
 */
test("a read-only hooks directory holding a writable hook is still repaired", () => {
  withRepo(({ root, hooksDir }) => {
    const line = installDelegate(hooksDir);
    const hookPath = path.join(hooksDir, "prepare-commit-msg");
    fs.writeFileSync(hookPath, "#!/bin/sh\n# generated\n");
    fs.chmodSync(hookPath, 0o755);
    fs.chmodSync(hooksDir, 0o555);
    try {
      assert.equal(sessionStart(root).status, 0);
      assert.ok(hookText(hooksDir).includes(line));
    } finally {
      fs.chmodSync(hooksDir, 0o755);
    }
  });
});

/**
 * The defect an independent check reproduced, and the one no case above could see: every
 * one of them starts the session at the repository root, where resolving against the root
 * and against the cwd give the same answer.
 *
 * `git rev-parse --git-path hooks` prints relative to the directory it ran in. Resolved
 * against the repository root instead, a session started in `sub/deep` produced
 * `<root>/../../.git/hooks` — a path two levels ABOVE the checkout, which is where the
 * repair then wrote, while the session's own repository stayed broken.
 */
test("a session started in a subdirectory repairs its own repository, and nothing above it", () => {
  withRepo(({ root, sessionCwd, hooksDir }) => {
    const line = installDelegate(hooksDir);
    regenerateHook(hooksDir);
    // Two levels up, which is where the defect actually wrote: it resolved
    // `../../.git/hooks` against the repository root. One level up would assert nothing.
    const outside = path.resolve(root, "..", "..", ".git", "hooks", "prepare-commit-msg");

    assert.equal(sessionStart(sessionCwd).status, 0);

    assert.ok(hookText(hooksDir).includes(line), "the session's own hook is repaired");
    assert.equal(fs.existsSync(outside), false, "nothing was written above the repository");
  }, path.join("sub", "deep"));
});

/**
 * `core.hooksPath` may point into the working tree — a checked-in `.githooks/` is a common
 * way to share hooks with a team. `aidd telemetry on` writing the line once was a write a
 * person asked for; this one is not, it recurs on every session, and it would dirty a
 * tracked file with a machine-absolute path nobody can commit.
 */
test("a hooks directory inside the working tree is never written to", () => {
  withRepo(({ root, hooksDir }) => {
    const shared = path.join(root, ".githooks");
    fs.mkdirSync(shared, { recursive: true });
    spawnSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: root, env: CLEAN_ENV });
    fs.writeFileSync(path.join(shared, DELEGATE), "#!/bin/sh\nexit 0\n");
    fs.chmodSync(path.join(shared, DELEGATE), 0o755);
    const teamHook = path.join(shared, "prepare-commit-msg");
    fs.writeFileSync(teamHook, "#!/bin/sh\n# the team's own\nexit 0\n");
    const before = fs.readFileSync(teamHook, "utf8");
    void hooksDir;

    assert.equal(sessionStart(root).status, 0);

    assert.equal(fs.readFileSync(teamHook, "utf8"), before);
  });
});

// `writeFileSync` follows a symlink and edits whatever it points at — most usefully a file
// the team shares. The link is somebody's deliberate indirection, and it is left alone.
test("a prepare-commit-msg that is a symlink is left alone, target and all", () => {
  withRepo(({ root, hooksDir }) => {
    installDelegate(hooksDir);
    const target = path.join(root, "shared-hook.sh");
    fs.writeFileSync(target, "#!/bin/sh\n# shared\nexit 0\n");
    fs.symlinkSync(target, path.join(hooksDir, "prepare-commit-msg"));
    const before = fs.readFileSync(target, "utf8");

    assert.equal(sessionStart(root).status, 0);

    assert.equal(fs.readFileSync(target, "utf8"), before);
    assert.ok(fs.lstatSync(path.join(hooksDir, "prepare-commit-msg")).isSymbolicLink());
  });
});

/**
 * The fallback that keeps the journal alive on an older git, which a systematic mutation
 * pass found guarded by nothing — the blocker it fixes could have come straight back.
 *
 * `rev-parse` fails atomically, so a git that does not understand `--git-path` answers
 * non-zero for every option asked with it. Without the three-option retry, the whole
 * location read returns null and the session records nothing at all.
 */
test("a git that rejects --git-path still journals the session", () => {
  withRepo(({ root }) => {
    const stub = path.join(root, "stub");
    fs.mkdirSync(stub, { recursive: true });
    const real = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    fs.writeFileSync(
      path.join(stub, "git"),
      `#!/bin/sh\nfor a in "$@"; do [ "$a" = "--git-path" ] && exit 129; done\nexec ${real} "$@"\n`
    );
    fs.chmodSync(path.join(stub, "git"), 0o755);

    const result = spawnSync(process.execPath, [HOOK, "session-start"], {
      cwd: root,
      encoding: "utf8",
      input: JSON.stringify({
        session_id: SESSION,
        cwd: root,
        transcript_path: `/home/dev/.claude/projects/-repo/${SESSION}.jsonl`,
        hook_event_name: "SessionStart",
        source: "startup",
      }),
      env: {
        ...CLEAN_ENV,
        PATH: `${stub}${path.delimiter}${CLEAN_ENV.PATH}`,
        HOME: path.join(root, "aidd-home"),
        AIDD_RUNS_DIR: path.join(root, "aidd-runs"),
      },
    });

    assert.equal(result.status, 0);
    assert.ok(
      fs.existsSync(path.join(root, "aidd-runs")) &&
        fs.readdirSync(path.join(root, "aidd-runs")).some((name) => name.endsWith(".jsonl")),
      "the session is journalled even though git refused --git-path"
    );
  });
});

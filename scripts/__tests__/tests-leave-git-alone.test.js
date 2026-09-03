const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  snapshotDirectory,
  describeChanges,
} = require("../check-tests-leave-git-alone.js");

const GUARD = path.resolve(__dirname, "..", "check-tests-leave-git-alone.js");

/**
 * The guard that would have caught a test writing into the repository's own hooks.
 *
 * It happened: on 2026-09-03 the trailer-repair suite's `git init` inherited this
 * repository's exported `GIT_DIR`, so its stub `prepare-commit-msg` and stub delegate
 * landed in the real `.git/hooks`, replacing an install that had stood since 22 August.
 * Every test passed. `aidd telemetry check` reported it hours later, by which point the
 * original was gone — `.git/hooks` is in no history.
 *
 * `CLEAN_ENV` in that one suite fixes that one suite. This is the invariant instead, and it
 * is deliberately narrower than "tests must strip GIT_*": some tests query the real
 * repository on purpose (`git ls-files` over the tree). Reading it is fine. Changing it is
 * never fine.
 */

function withDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-git-alone-"));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── the snapshot ───────────────────────────────────────────────────────────

test("a directory that does not exist snapshots as absent, never as empty", () => {
  withDir((dir) => {
    const missing = snapshotDirectory(path.join(dir, "nope"));

    assert.equal(missing, null);
  });
});

test("a snapshot carries every file's size and mode, not only its name", () => {
  withDir((dir) => {
    fs.writeFileSync(path.join(dir, "pre-commit"), "#!/bin/sh\n", { mode: 0o755 });

    const shot = snapshotDirectory(dir);

    assert.deepEqual(Object.keys(shot), ["pre-commit"]);
    assert.equal(shot["pre-commit"].size, 10);
    assert.equal(typeof shot["pre-commit"].mode, "number");
  });
});

// ── what counts as a change ────────────────────────────────────────────────

test("an untouched directory reports no change", () => {
  withDir((dir) => {
    fs.writeFileSync(path.join(dir, "pre-commit"), "#!/bin/sh\n");
    const before = snapshotDirectory(dir);

    assert.deepEqual(describeChanges(before, snapshotDirectory(dir)), []);
  });
});

test("a file whose content changed is reported, even at the same size", () => {
  withDir((dir) => {
    const at = path.join(dir, "prepare-commit-msg");
    fs.writeFileSync(at, "aaaaaaaaaa");
    const before = snapshotDirectory(dir);
    fs.writeFileSync(at, "bbbbbbbbbb");

    const changes = describeChanges(before, snapshotDirectory(dir));

    assert.equal(changes.length, 1);
    assert.match(changes[0], /prepare-commit-msg/u);
  });
});

// This is the exact shape of the leak: a real hook replaced by a shorter stub.
test("a hook replaced by a stub is reported as changed", () => {
  withDir((dir) => {
    const at = path.join(dir, "prepare-commit-msg");
    fs.writeFileSync(at, `#!/bin/sh\nsh "${dir}/aidd-session-trailer.sh" "$@"\n`, { mode: 0o755 });
    const before = snapshotDirectory(dir);
    fs.writeFileSync(at, "#!/bin/sh\n");

    const changes = describeChanges(before, snapshotDirectory(dir));

    assert.equal(changes.length, 1);
    assert.match(changes[0], /prepare-commit-msg/u);
  });
});

test("a file that appeared is reported as added", () => {
  withDir((dir) => {
    const before = snapshotDirectory(dir);
    fs.writeFileSync(path.join(dir, "aidd-session-trailer.sh"), "#!/bin/sh\nexit 0\n");

    const changes = describeChanges(before, snapshotDirectory(dir));

    assert.equal(changes.length, 1);
    assert.match(changes[0], /added.*aidd-session-trailer\.sh/u);
  });
});

test("a file that disappeared is reported as removed, never ignored", () => {
  withDir((dir) => {
    const at = path.join(dir, "pre-push");
    fs.writeFileSync(at, "#!/bin/sh\n");
    const before = snapshotDirectory(dir);
    fs.unlinkSync(at);

    const changes = describeChanges(before, snapshotDirectory(dir));

    assert.equal(changes.length, 1);
    assert.match(changes[0], /removed.*pre-push/u);
  });
});

// A mode change alone is what turned the leaked hook inert: git silently ignores a
// `prepare-commit-msg` it cannot execute, so losing the bit is losing the feature.
//
// Compared on two snapshots built by hand, never by `chmod`. Windows records no execute bit
// — every writable file reports `0o666` whatever it was chmod'ed to — so a filesystem round
// trip there produces no mode change to notice, and the test would be measuring the platform
// instead of the comparison. The comparison is pure; only *producing* a mode change needs a
// filesystem that keeps one.
test("a mode change alone is reported", () => {
  const same = { size: 10, hash: "deadbeefdeadbeef" };

  const changes = describeChanges(
    { "prepare-commit-msg": { ...same, mode: 0o755 } },
    { "prepare-commit-msg": { ...same, mode: 0o644 } }
  );

  assert.equal(changes.length, 1);
  assert.match(changes[0], /mode 0755 -> 0644/u);
});

test("a directory that was absent and now exists is a change, not a fresh baseline", () => {
  withDir((dir) => {
    const hooks = path.join(dir, "hooks");
    const before = snapshotDirectory(hooks);
    fs.mkdirSync(hooks);
    fs.writeFileSync(path.join(hooks, "pre-commit"), "x");

    const changes = describeChanges(before, snapshotDirectory(hooks));

    assert.equal(changes.length, 1);
    assert.match(changes[0], /appeared/u);
  });
});

// ── the guard, run for real ────────────────────────────────────────────────

test("a command that leaves the watched directory alone passes the guard through", () => {
  withDir((dir) => {
    fs.writeFileSync(path.join(dir, "pre-commit"), "#!/bin/sh\n");

    const run = spawnSync(process.execPath, [GUARD, "--watch", dir, "--", process.execPath, "-e", ""], {
      encoding: "utf8",
    });

    assert.equal(run.status, 0, run.stderr);
  });
});

test("a command that writes into the watched directory fails the guard, naming the file", () => {
  withDir((dir) => {
    const at = path.join(dir, "prepare-commit-msg");
    fs.writeFileSync(at, `#!/bin/sh\nsh "${dir}/delegate.sh" "$@"\n`);

    const run = spawnSync(
      process.execPath,
      [GUARD, "--watch", dir, "--", process.execPath, "-e", `require("fs").writeFileSync(${JSON.stringify(at)}, "#!/bin/sh\\n")`],
      { encoding: "utf8" }
    );

    assert.equal(run.status, 1);
    assert.match(run.stderr + run.stdout, /prepare-commit-msg/u);
  });
});

// The guard reports the command's own failure, never replaces it: a red suite must stay red
// with its own exit code, or the guard becomes a way to lose test failures.
test("a failing command keeps its own exit code when nothing was touched", () => {
  withDir((dir) => {
    // Exit 3, not 1: the guard's own failure code is 1, so asserting on 1 would hold
    // whether the code was passed through or invented.
    const run = spawnSync(
      process.execPath,
      [GUARD, "--watch", dir, "--", process.execPath, "-e", "process.exit(3)"],
      { encoding: "utf8" }
    );

    assert.equal(run.status, 3);
  });
});

test("the guard refuses to run with no command, rather than passing vacuously", () => {
  withDir((dir) => {
    const run = spawnSync(process.execPath, [GUARD, "--watch", dir], { encoding: "utf8" });

    assert.equal(run.status, 2);
    assert.match(run.stderr, /command/iu);
  });
});

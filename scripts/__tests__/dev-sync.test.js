const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { delimiter, join, resolve } = require("node:path");
const test = require("node:test");

const repo = resolve(__dirname, "../..");

function executable(path, body) {
  writeFileSync(path, `#!/bin/sh\nset -eu\n${body}\n`);
  chmodSync(path, 0o755);
}

/** On POSIX, nothing but the stubs and the platform's own utilities, so a real `opencode` or
 * `claude` installed on the machine running these tests can never answer in their place.
 * Windows has neither directory, and the utilities `dev-sync.sh` calls live wherever Git for
 * Windows put them, so there the inherited `PATH` is kept with the stubs merely first. */
const BASE_PATH =
  process.platform === "win32" ? (process.env.PATH ?? "") : ["/usr/bin", "/bin"].join(delimiter);

function runSync(fakeBin, home, args = ["all"]) {
  // `bash`, resolved on PATH, never the literal `/bin/bash`: that path does not exist on
  // Windows, where bash is the one Git for Windows ships. `spawnSync` resolves a bare name
  // through the platform's own rules on both.
  return spawnSync("bash", [join(repo, "scripts/dev-sync.sh"), ...args], {
    cwd: repo,
    env: {
      ...process.env,
      PATH: [fakeBin, BASE_PATH].join(delimiter),
      HOME: home,
      BUILD: join(home, "build"),
    },
    encoding: "utf8",
  });
}

test("managed OpenCode reload uses the fixed-purpose helper without a local build", () => {
  const root = mkdtempSync(join(tmpdir(), "aidd-dev-sync-managed-"));
  try {
    const fakeBin = join(root, "bin");
    const home = join(root, "home");
    mkdirSync(fakeBin);
    mkdirSync(home);
    executable(join(fakeBin, "aidd-opencode-reload"), 'echo "managed:ok"');

    const result = runSync(fakeBin, home);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /reload opencode\s+managed:ok/);
    assert.equal(existsSync(join(home, "build")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local OpenCode reload installs only the selected plugin skills globally", () => {
  const root = mkdtempSync(join(tmpdir(), "aidd-dev-sync-local-"));
  try {
    const fakeBin = join(root, "bin");
    const home = join(root, "home");
    mkdirSync(fakeBin);
    mkdirSync(home);
    mkdirSync(join(home, ".config/opencode/skills/aidd-dev-stale"), { recursive: true });
    writeFileSync(join(home, ".config/opencode/skills/aidd-dev-stale/SKILL.md"), "stale\n");
    executable(join(fakeBin, "opencode"), "exit 0");
    executable(
      join(fakeBin, "npx"),
      String.raw`out=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--out" ]; then shift; out=$1; fi
  shift
done
mkdir -p "$out/.opencode/skills/aidd-dev-01-plan"
printf '%s\n' '---' 'name: aidd-dev-01-plan' 'description: test' '---' > "$out/.opencode/skills/aidd-dev-01-plan/SKILL.md"`,
    );

    const result = runSync(fakeBin, home, ["aidd-dev"]);
    assert.equal(result.status, 0, result.stderr);
    const installed = join(home, ".config/opencode/skills/aidd-dev-01-plan/SKILL.md");
    assert.match(readFileSync(installed, "utf8"), /name: aidd-dev-01-plan/);
    assert.equal(existsSync(join(home, ".config/opencode/skills/aidd-dev-stale")), false);
    assert.match(result.stdout, /install opencode\s+skills:ok/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const assert = require("node:assert/strict");
const {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { delimiter, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

test("worktree-create installs root and CLI dependencies", () => {
  const fixtureRoot = realpathSync(mkdtempSync(join(tmpdir(), "worktree-create-")));
  const binDir = join(fixtureRoot, "bin");
  const repoRoot = join(fixtureRoot, "repo");
  const pnpmLog = join(fixtureRoot, "pnpm.log");
  const hookPath = resolve(".claude/hooks/worktree-create.js");

  mkdirSync(binDir, { recursive: true });
  mkdirSync(repoRoot, { recursive: true });

  const fakeGit = `#!/usr/bin/env node
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const args = process.argv.slice(2);
if (args[0] === "rev-parse" && args.includes("refs/heads/next")) process.exit(0);
if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
  process.stdout.write(process.env.FAKE_REPO_ROOT + "\\n");
  process.exit(0);
}
if (args[0] === "worktree" && args[1] === "add") {
  mkdirSync(join(args[2], "cli"), { recursive: true });
  process.exit(0);
}
process.exit(1);
`;

  const fakePnpm = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
appendFileSync(
  process.env.FAKE_PNPM_LOG,
  process.cwd() + "\\t" + process.argv.slice(2).join(" ") + "\\n",
);
`;

  writeFileSync(join(binDir, "git"), fakeGit);
  writeFileSync(join(binDir, "pnpm"), fakePnpm);
  chmodSync(join(binDir, "git"), 0o755);
  chmodSync(join(binDir, "pnpm"), 0o755);

  try {
    const result = spawnSync(process.execPath, [hookPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_PNPM_LOG: pnpmLog,
        FAKE_REPO_ROOT: repoRoot,
        PATH: `${binDir}${delimiter}${process.env.PATH}`,
      },
      input: JSON.stringify({ name: "audit" }),
    });

    assert.equal(result.status, 0, result.stderr);

    const worktreePath = join(repoRoot, ".claude", "worktrees", "audit");
    assert.equal(result.stdout, `${worktreePath}\n`);
    assert.deepEqual(readFileSync(pnpmLog, "utf8").trim().split("\n"), [
      `${worktreePath}\tinstall --frozen-lockfile`,
      `${join(worktreePath, "cli")}\tinstall --frozen-lockfile`,
    ]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

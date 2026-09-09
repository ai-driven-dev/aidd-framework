import { execFile, execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/runtime/git/git-environment.js";
import { createTestEnv, gitInit, runCliFast } from "./helpers.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(process.cwd(), "..");
const JOURNAL_HOOK = resolve(REPO_ROOT, "plugins/aidd-telemetry/hooks/journal.cjs");
const SETUP_ARGS = [
  "setup",
  "--source",
  "local",
  "--path",
  REPO_ROOT,
  "--ai",
  "claude",
  "--plugins",
  "aidd-telemetry",
  "--yes",
] as const;

describe("aidd setup never offers the run journal to a commit", () => {
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await createTestEnv("journal-gitignore"));
    await gitInit(projectDir);
  });

  afterEach(async () => {
    await cleanup();
  });

  function env(): NodeJS.ProcessEnv {
    return { ...environmentWithoutGitVariables(process.env), HOME: fakeHome };
  }

  function journal(event: string, payload: Record<string, unknown>): void {
    execFileSync(process.execPath, [JOURNAL_HOOK, event], {
      input: JSON.stringify(payload),
      cwd: projectDir,
      env: env(),
    });
  }

  it("adds the run journal to .gitignore, and covers nothing wider", async () => {
    const { exitCode, stderr } = await runCliFast([...SETUP_ARGS], projectDir, fakeHome);

    expect(exitCode, stderr).toBe(0);
    const gitignore = await readFile(`${projectDir}/.gitignore`, "utf8");
    expect(gitignore).toContain("aidd_docs/runs/");
    expect(gitignore).not.toContain("aidd_docs/*");
    expect(gitignore).not.toMatch(/^aidd_docs\/$/mu);
  });

  it("stops offering a journalled session to git status once measurement is on", async () => {
    await runCliFast([...SETUP_ARGS], projectDir, fakeHome);
    // `aidd setup` installs the plugin; turning measurement on is a separate, later act -
    // done here the same way `.aidd/config.json`'s only reader (the journal hook) reads it.
    await writeFile(
      `${projectDir}/.aidd/config.json`,
      JSON.stringify({ telemetry: { enabled: true } })
    );
    journal("session-start", {
      session_id: "33333333-3333-4333-8333-333333333333",
      hook_event_name: "SessionStart",
      cwd: projectDir,
      transcript_path: `${fakeHome}/.claude/projects/fake/x.jsonl`,
    });

    const written = await readdir(`${projectDir}/aidd_docs/runs`);
    expect(
      written.some((f) => f.endsWith(".jsonl")),
      "the hook did not actually journal"
    ).toBe(true);

    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], {
      cwd: projectDir,
      env: environmentWithoutGitVariables(process.env),
    });
    expect(stdout).not.toContain("aidd_docs");
  });
});

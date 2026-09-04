import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { journalRepo } from "../../../helpers/telemetry-journal-hook.js";

// git exports GIT_DIR into every process it spawns, and the journal hook runs from inside
// one. It must read the repository at `cwd` rather than the one the environment points at:
// without the strip, a session started from a git hook or a CI step tags every record it
// writes with the wrong project — and the CLI reads that project off the journal
// (`session-project.ts`), so a wrong answer here is a wrong answer in every report.
describe("the journal hook does not follow a leaked GIT_DIR", () => {
  const created: string[] = [];
  const savedGitDir = process.env.GIT_DIR;

  afterEach(() => {
    if (savedGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = savedGitDir;
    for (const dir of created) rmSync(dir, { recursive: true, force: true });
    created.length = 0;
  });

  function makeRepo(remoteUrl: string): string {
    const dir = mkdtempSync(join(tmpdir(), "aidd-gitdir-"));
    created.push(dir);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))
    );
    execFileSync("git", ["init", "-q", "."], { cwd: dir, env });
    execFileSync("git", ["remote", "add", "origin", remoteUrl], { cwd: dir, env });
    return dir;
  }

  it("reads the remote of the repository at cwd, not the one GIT_DIR names", () => {
    const elsewhere = makeRepo("git@github.com:leaked/elsewhere.git");
    const here = makeRepo("git@github.com:expected/here.git");

    process.env.GIT_DIR = join(elsewhere, ".git");

    expect(journalRepo.deriveProjectId(here)).toBe("expected/here");
  });
});

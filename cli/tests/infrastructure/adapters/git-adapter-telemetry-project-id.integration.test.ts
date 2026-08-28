import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitAdapter } from "../../../src/infrastructure/adapters/git-adapter.js";
import { InMemoryFileAdapter } from "../../helpers/ports/in-memory-file-adapter.js";
import { journalRepo } from "../../helpers/telemetry-journal-hook.js";

// git exports GIT_DIR into every process it spawns, so both sides of the join must read
// the repository at `cwd` rather than the one the environment points at. Without the
// strip, a CLI run from a git hook or a CI step tags records with the wrong project.
describe("neither side follows a leaked GIT_DIR", () => {
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

  it("reads the remote of the repository at cwd, not the one GIT_DIR names", async () => {
    const elsewhere = makeRepo("git@github.com:leaked/elsewhere.git");
    const here = makeRepo("git@github.com:expected/here.git");

    process.env.GIT_DIR = join(elsewhere, ".git");

    const git = new GitAdapter(new InMemoryFileAdapter());
    expect(await git.getRemoteUrl(here)).toBe("git@github.com:expected/here.git");
    expect(journalRepo.deriveProjectId(here)).toBe("expected/here");
  });
});

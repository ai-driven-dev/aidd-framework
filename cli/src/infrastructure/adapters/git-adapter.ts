import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { FileReader } from "../../domain/ports/file-reader.js";
import type { FileWriter } from "../../domain/ports/file-writer.js";
import type { VersionControl } from "../../domain/ports/version-control.js";
import { environmentWithoutGitVariables } from "../git-environment.js";

const GITDIR_PREFIX = "gitdir:";
const HOOK_HEADER = "#!/bin/sh";
const PRE_COMMIT_HOOK = "pre-commit";

export class GitAdapter implements VersionControl {
  constructor(private readonly fs: FileReader & FileWriter) {}

  async installPreCommitDelegate(projectRoot: string, delegatePath: string): Promise<void> {
    const hooksDir = await this.resolveHooksDir(projectRoot);
    if (hooksDir === null) return;

    const marker = `sh ${delegatePath}`;
    const hookPath = join(hooksDir, PRE_COMMIT_HOOK);
    const exists = await this.fs.fileExists(hookPath);
    let content = exists ? await this.fs.readFile(hookPath) : `${HOOK_HEADER}\n`;

    if (content.includes(marker)) return;

    if (!content.endsWith("\n")) content += "\n";
    content += `${marker}\n`;

    await this.fs.writeFile(hookPath, content);
    await this.fs.chmodExecutable(hookPath);
  }

  // Mirrors the journal hook's own `getRemoteUrl` (plugins/aidd-telemetry/hooks/lib/repo.cjs)
  // exactly, so `aidd telemetry on` derives the same `aidd.project_id` the journal does.
  async getRemoteUrl(repoRoot: string): Promise<string | null> {
    try {
      const result = spawnSync("git", ["remote", "get-url", "origin"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: environmentWithoutGitVariables(),
      });
      if (result.status !== 0) return null;
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }

  // Mirrors the plugin's own `repo.cjs` (`isGitRepo`): a non-zero exit or a thrown spawn
  // error both read as "not a repository", never a throw here — `aidd telemetry check`
  // gates on this before judging anything else, and a gate that could itself throw would
  // be the exact silent failure this command exists to avoid.
  async isRepository(cwd: string): Promise<boolean> {
    try {
      const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        encoding: "utf8",
        env: environmentWithoutGitVariables(),
      });
      return result.status === 0 && result.stdout.trim() !== "";
    } catch {
      return false;
    }
  }

  // The rule the plugin's own `warnIfTracked` read by, before the CLI took this over: a
  // non-zero exit —
  // no repository at all, or git itself missing — reads the same as "nothing tracked",
  // never a throw. Turning telemetry on must not depend on being inside a git repository.
  async listTrackedFiles(repoRoot: string, pathspec: string): Promise<readonly string[]> {
    try {
      const result = spawnSync("git", ["ls-files", "--", pathspec], {
        cwd: repoRoot,
        encoding: "utf8",
        env: environmentWithoutGitVariables(),
      });
      if (result.status !== 0) return [];
      return result.stdout.split("\n").filter((line) => line.trim() !== "");
    } catch {
      return [];
    }
  }

  // `git log` on a pathspec, not `git ls-files`: the index and history are different
  // questions, and this is the one call that actually asks the second. A zero-commit
  // repository (`git log` itself fails: "does not have any commits yet") and a normal repo
  // where `pathspec` was only ever staged both read the same way here — no history — which
  // is the honest answer for both.
  async hasHistoryFor(repoRoot: string, pathspec: string): Promise<boolean> {
    try {
      const result = spawnSync("git", ["log", "--oneline", "-1", "--", pathspec], {
        cwd: repoRoot,
        encoding: "utf8",
        env: environmentWithoutGitVariables(),
      });
      return result.status === 0 && result.stdout.trim() !== "";
    } catch {
      return false;
    }
  }

  private async resolveHooksDir(projectRoot: string): Promise<string | null> {
    const gitEntry = join(projectRoot, ".git");
    if (!(await this.fs.fileExists(gitEntry))) return null;

    let gitDir = gitEntry;
    try {
      const fileContent = await this.fs.readFile(gitEntry);
      const firstLine = fileContent.trim().split("\n")[0] ?? "";
      if (firstLine.startsWith(GITDIR_PREFIX)) {
        const worktreeGitDir = firstLine.slice(GITDIR_PREFIX.length).trim();
        // common git dir: .git/worktrees/<name> -> two levels up -> .git
        gitDir = join(worktreeGitDir, "..", "..");
      }
    } catch {
      // .git is a directory — gitDir stays as-is
    }

    return join(gitDir, "hooks");
  }
}

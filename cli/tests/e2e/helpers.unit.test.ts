import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitShellDirs, pathDirsWithoutAidd } from "./helpers.js";

/**
 * The Windows half of `pathWithoutAidd`, provable from any platform.
 *
 * Git runs a hook by reading its shebang and looking the interpreter up by name on `PATH`:
 * `#!/bin/sh` sends it looking for `sh.exe`. On POSIX that helper already carries `/bin`, so
 * the dependency is invisible. On Windows the shell lives in `<git>\bin` and `<git>\usr\bin`
 * — never in the `cmd` directory `git.exe` is usually found in — and a `PATH` built without
 * them makes every hook fail with `cannot spawn …: No such file or directory`, which reads
 * exactly like a missing hook file and is nothing of the sort. Six commit-trailer e2e tests
 * failed that way on the Windows runner and nowhere else.
 *
 * The directory probe is injected, so the layouts below are asserted here rather than only
 * on a runner nobody developing this has in front of them.
 */
describe("the directories a git hook's own shell is found in", () => {
  const GIT_ROOT = "C:\\Program Files\\Git";
  const holdsShell = (dirs: readonly string[]) => (dir: string) => dirs.includes(dir);

  it("finds the shell beside a git.exe living in cmd, which is the usual install", () => {
    const cmdDir = join(GIT_ROOT, "cmd");

    expect(
      gitShellDirs(cmdDir, holdsShell([join(GIT_ROOT, "bin"), join(GIT_ROOT, "usr", "bin")]))
    ).toEqual([join(GIT_ROOT, "bin"), join(GIT_ROOT, "usr", "bin")]);
  });

  it("finds it beside a git.exe living in bin, where the root is the same directory up", () => {
    const binDir = join(GIT_ROOT, "bin");

    expect(gitShellDirs(binDir, holdsShell([join(GIT_ROOT, "usr", "bin")]))).toEqual([
      join(GIT_ROOT, "usr", "bin"),
    ]);
  });

  // Probed, never assumed: an install laid out some other way contributes nothing rather
  // than a path that does not exist, which would only push the failure one step later.
  it("contributes nothing when neither candidate actually holds a shell", () => {
    expect(gitShellDirs(join(GIT_ROOT, "cmd"), () => false)).toEqual([]);
  });

  it("contributes nothing when git itself was never found", () => {
    expect(gitShellDirs(undefined, () => true)).toEqual([]);
  });
});

describe("the PATH a sandboxed run is given, on the platform nobody here can run", () => {
  const GIT_ROOT = "C:\\Program Files\\Git";
  const WINDOWS = {
    platform: "win32" as NodeJS.Platform,
    nodeDir: "C:\\Program Files\\nodejs",
    gitDir: join(GIT_ROOT, "cmd"),
    systemRoot: "C:\\Windows",
    holdsShell: (dir: string) => dir === join(GIT_ROOT, "bin"),
  };

  // The whole point: git spawns every hook through this shell, so a PATH without it turns
  // an installed, correct hook into `cannot spawn …: No such file or directory`.
  it("carries a directory holding the shell git runs hooks through", () => {
    expect(pathDirsWithoutAidd(WINDOWS)).toContain(join(GIT_ROOT, "bin"));
  });

  it("still carries node, git and the system directories the loader needs", () => {
    const dirs = pathDirsWithoutAidd(WINDOWS);

    expect(dirs[0]).toBe(WINDOWS.nodeDir);
    expect(dirs).toContain(join(GIT_ROOT, "cmd"));
    expect(dirs).toContain(join("C:\\Windows", "System32"));
  });

  // POSIX finds its shell in `/bin`, which is why this dependency stayed invisible for as
  // long as it did.
  it("gets its shell from /bin on POSIX, where the same dependency is already met", () => {
    const dirs = pathDirsWithoutAidd({
      ...WINDOWS,
      platform: "darwin",
      nodeDir: "/usr/local/bin",
      gitDir: "/usr/bin",
    });

    expect(dirs).toContain("/bin");
    expect(dirs).not.toContain(join(GIT_ROOT, "bin"));
  });
});

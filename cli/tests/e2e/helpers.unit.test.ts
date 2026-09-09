import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pathDirsWithoutAidd, shellDirsWithoutAidd } from "./helpers.js";

/**
 * Git runs a hook by looking its shebang interpreter up by name on `PATH`, so a narrow
 * `PATH` with no shell on it fails as `cannot spawn …: No such file or directory`.
 */
const GIT_ROOT = "C:\\Program Files\\Git";
const GIT_BIN = join(GIT_ROOT, "mingw64", "bin");
const SHELL_DIRS = [join(GIT_ROOT, "usr", "bin"), join(GIT_ROOT, "bin")];
const AIDD_BIN = "C:\\Users\\runner\\AppData\\Roaming\\npm";

/** The runner's own `PATH`, in the order it reported: git's directory, both shell
 * directories, one of them twice, and the npm directory a global `aidd` install lands in. */
const RUNNER_PATH = [GIT_BIN, ...SHELL_DIRS, AIDD_BIN, join(GIT_ROOT, "usr", "bin")];

function holds(dir: string, name: string): boolean {
  if (name === "sh") return SHELL_DIRS.includes(dir);
  if (name === "git") return dir === GIT_BIN;
  if (name === "aidd") return dir === AIDD_BIN;
  return false;
}

describe("choosing the directories a git hook's own shell is found in", () => {
  it("takes the ones that actually hold a shell, wherever git itself happens to live", () => {
    expect(shellDirsWithoutAidd(RUNNER_PATH, holds)).toEqual(SHELL_DIRS);
  });

  it("names each one once, however often PATH repeats it", () => {
    const chosen = shellDirsWithoutAidd(RUNNER_PATH, holds);

    expect(new Set(chosen).size).toBe(chosen.length);
  });

  // The whole reason this list is filtered rather than taken whole: a directory carrying
  // `aidd` would readmit the binary these tests exist to prove unnecessary.
  it("refuses a shell directory that also carries aidd", () => {
    const shared = "C:\\shared";

    const chosen = shellDirsWithoutAidd([shared], (dir, name) =>
      dir === shared ? name === "sh" || name === "aidd" : false
    );

    expect(chosen).toEqual([]);
  });

  it("finds none when nothing on PATH holds a shell", () => {
    expect(shellDirsWithoutAidd([GIT_BIN], holds)).toEqual([]);
  });
});

describe("the PATH a sandboxed run is given, on the platform nobody here can run", () => {
  const WINDOWS = {
    platform: "win32" as NodeJS.Platform,
    nodeDir: "C:\\Program Files\\nodejs",
    gitDir: GIT_BIN,
    systemRoot: "C:\\Windows",
    pathDirs: RUNNER_PATH,
    holds,
  };

  // Git spawns every hook through this shell, so a PATH without it turns an installed,
  // correct hook into `cannot spawn …: No such file or directory`.
  it("carries the shell git runs hooks through, on the runner's real layout", () => {
    const dirs = pathDirsWithoutAidd(WINDOWS);

    for (const shell of SHELL_DIRS) expect(dirs).toContain(shell);
  });

  it("still carries node, git and the system directories the loader needs", () => {
    const dirs = pathDirsWithoutAidd(WINDOWS);

    expect(dirs[0]).toBe(WINDOWS.nodeDir);
    expect(dirs).toContain(GIT_BIN);
    expect(dirs).toContain(join("C:\\Windows", "System32"));
  });

  it("never carries the directory a global aidd install lands in", () => {
    expect(pathDirsWithoutAidd(WINDOWS)).not.toContain(AIDD_BIN);
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
    for (const shell of SHELL_DIRS) expect(dirs).not.toContain(shell);
  });
});

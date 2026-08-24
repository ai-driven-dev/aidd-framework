import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { CLIOutput } from "../../src/application/output.js";
import { InitUseCase } from "../../src/application/use-cases/init-use-case.js";
import { createDeps } from "../../src/infrastructure/deps.js";
import { environmentWithoutGitVariables as withoutGitEnv } from "../../src/infrastructure/git-environment.js";

export const execFileAsync = promisify(execFile);

export async function gitInit(cwd: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd, env: withoutGitEnv(process.env) });
}

export async function gitSetOriginRemote(cwd: string, url: string): Promise<void> {
  await execFileAsync("git", ["remote", "add", "origin", url], {
    cwd,
    env: withoutGitEnv(process.env),
  });
}

export const CLI_PATH = resolve(process.cwd(), "dist/cli.js");
export const FRAMEWORK_PATH = resolve(process.cwd(), "tests/fixtures/framework");
export const FRAMEWORK_V2_PATH = resolve(process.cwd(), "tests/fixtures/framework-v2");

export async function createTestEnv(prefix: string): Promise<{
  tempDir: string;
  projectDir: string;
  fakeHome: string;
  cleanup: () => Promise<void>;
}> {
  const tempDir = await mkdtemp(join(tmpdir(), `aidd-e2e-${prefix}-`));
  const projectDir = join(tempDir, "project");
  const fakeHome = join(tempDir, "home");
  await mkdir(projectDir, { recursive: true });
  await mkdir(fakeHome, { recursive: true });
  // Mirror real ~/.gitconfig into fakeHome so git operations (clone, fetch)
  // work from sandboxed HOME without losing user identity / credential helpers.
  const realGitconfig = join(homedir(), ".gitconfig");
  if (existsSync(realGitconfig)) {
    await copyFile(realGitconfig, join(fakeHome, ".gitconfig"));
  }
  return {
    tempDir,
    projectDir,
    fakeHome,
    cleanup: () => rm(tempDir, { recursive: true, force: true }),
  };
}

/** Copies a fixture directory's contents into a sandboxed home — what `cp -R "$src/." dest`
 * did before this, ported off a binary that only exists on POSIX: there is no `cp` on
 * Windows, so every caller that shelled out to it failed `beforeEach` outright there before
 * a single assertion ran, which is why the suites built on top of it failed wholesale. */
export async function copyFixtureTree(sourceDir: string, destDir: string): Promise<void> {
  await cp(sourceDir, destDir, { recursive: true });
}

function hasExecutable(dir: string, name: string): boolean {
  const exeName = process.platform === "win32" ? `${name}.exe` : name;
  return existsSync(join(dir, exeName));
}

/** The first `PATH` directory carrying `git` but not `aidd` — skipping, never stopping at,
 * one that carries both. On this very machine `git` and a globally-linked `aidd` sit in the
 * same Homebrew directory; returning it unfiltered would silently readmit the binary these
 * tests exist to prove unnecessary. */
function findGitDirWithoutAidd(): string | undefined {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir === "") continue;
    if (hasExecutable(dir, "git") && !hasExecutable(dir, "aidd")) return dir;
  }
  return undefined;
}

/** A `PATH` holding only node's own directory, wherever `git` actually lives, and the
 * platform's own essential system directories — never a directory holding `aidd` or this
 * repository's own `node_modules` binaries. `/usr/bin` and `/bin` are POSIX paths; Windows
 * has neither, so a `PATH` built from them alone leaves a spawned process unable to find
 * `git.exe` (hooks/lib/repo.js shells out to it) or anything the OS loader itself needs. */
export function pathWithoutAidd(): string {
  const dirs = [dirname(process.execPath)];
  const gitDir = findGitDirWithoutAidd();
  if (gitDir) dirs.push(gitDir);
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
    dirs.push(join(systemRoot, "System32"), systemRoot);
  } else {
    dirs.push("/usr/bin", "/bin");
  }
  return dirs.join(delimiter);
}

// Where a person's own identity file lands under sandboxedEnv, restated rather than
// imported from the adapter: a test that asked the code where it wrote the file could not
// catch the code writing it somewhere the other side never looks. Mirrors both
// `person-identity-adapter.ts` and the plugin's `skills/00-init/scripts/lib/identity.js` (#707).
export function identityFileIn(fakeHome: string): string {
  return process.platform === "win32"
    ? join(fakeHome, "AppData", "Roaming", "aidd", "identity.json")
    : join(fakeHome, ".config", "aidd", "identity.json");
}

export function sandboxedEnv(
  fakeHome: string,
  extra?: Record<string, string>,
  options?: { realHome?: boolean }
): NodeJS.ProcessEnv {
  const base = withoutGitEnv(process.env);
  if (options?.realHome) {
    return { ...base, ...extra, AIDD_USER_CONFIG_DIR: join(fakeHome, ".config", "aidd") };
  }
  return {
    ...base,
    ...extra,
    HOME: fakeHome,
    XDG_CONFIG_HOME: join(fakeHome, ".config"),
    // `HOME` alone only sandboxes POSIX: `os.homedir()` never reads it on Windows, where it
    // reads `USERPROFILE` instead, and the CLI/plugin's own Windows config-dir rule reads
    // `APPDATA` ahead of that. Left at the real runner's values, both leak every test's
    // "sandboxed" home straight onto the machine's real profile. Harmless on POSIX, where
    // neither variable is consulted.
    USERPROFILE: fakeHome,
    APPDATA: join(fakeHome, "AppData", "Roaming"),
  };
}

export async function runCli(
  args: string[],
  cwd: string,
  fakeHome: string,
  options?: { realHome?: boolean; env?: Record<string, string> }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const env = sandboxedEnv(fakeHome, options?.env, options);
  try {
    const { stdout, stderr } = await execFileAsync("node", [CLI_PATH, ...args], { cwd, env });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.code ?? 1,
    };
  }
}

/** Skips marketplace refresh (network call) for fast/flake-prone tests. */
export async function runCliFast(
  args: string[],
  cwd: string,
  fakeHome: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const env = sandboxedEnv(fakeHome, { AIDD_SKIP_MARKETPLACE_REFRESH: "1" });
  try {
    const { stdout, stderr } = await execFileAsync("node", [CLI_PATH, ...args], { cwd, env });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.code ?? 1,
    };
  }
}

/**
 * Initializes a project with a manifest. Used to set up e2e test fixtures.
 * The frameworkPath parameter is kept for API compatibility but no longer used
 * (init no longer copies framework files).
 */
export async function initProject(projectDir: string, _frameworkPath: string): Promise<void> {
  const output = new CLIOutput(false);
  const deps = await createDeps(projectDir, { verbose: false }, output);
  await new InitUseCase(deps.fs, deps.manifestRepo).execute({
    projectRoot: projectDir,
  });
}

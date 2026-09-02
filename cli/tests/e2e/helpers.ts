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

/**
 * Where Git for Windows keeps the shell it ships, derived from wherever `git.exe` was found.
 *
 * This is not a convenience. Git runs a hook by reading its shebang and looking the
 * interpreter up **by name on `PATH`** — `#!/bin/sh` sends it looking for `sh.exe`. On POSIX
 * the list below already carries `/bin`, so it is found and nobody notices the dependency.
 * On Windows `sh.exe` lives in `<git>\bin` and `<git>\usr\bin`, never in the `cmd`
 * directory `git.exe` itself is usually found in — so a `PATH` built without these makes
 * every hook fail with `cannot spawn …: No such file or directory`, which reads exactly like
 * a missing hook file and is nothing of the sort.
 *
 * Measured: six `telemetry-commit-trailer` e2e tests failed that way on the Windows runner
 * while passing everywhere else, and the only one that passed was the one that installs no
 * hook at all.
 *
 * Probed rather than assumed — a directory is added only when it really holds a shell, so a
 * Git install laid out differently contributes nothing instead of a path that does not exist.
 */
export function gitShellDirs(
  gitDir: string | undefined,
  holdsShell: (dir: string) => boolean = (dir) => existsSync(join(dir, "sh.exe"))
): readonly string[] {
  if (gitDir === undefined) return [];
  const root = dirname(gitDir);
  return [join(root, "bin"), join(root, "usr", "bin")].filter(holdsShell);
}

/** A `PATH` holding only node's own directory, wherever `git` actually lives, and the
 * platform's own essential system directories — never a directory holding `aidd` or this
 * repository's own `node_modules` binaries. `/usr/bin` and `/bin` are POSIX paths; Windows
 * has neither, so a `PATH` built from them alone leaves a spawned process unable to find
 * `git.exe` (hooks/lib/repo.cjs shells out to it) or anything the OS loader itself needs —
 * nor, on that platform, the shell every git hook is spawned through (`gitShellDirs`). */
export interface PathWithoutAiddInputs {
  readonly platform: NodeJS.Platform;
  readonly nodeDir: string;
  readonly gitDir: string | undefined;
  readonly systemRoot: string;
  readonly holdsShell: (dir: string) => boolean;
}

/** The list itself, from stated inputs. Pure so the Windows shape is asserted from whatever
 * platform a person happens to be developing on — the branch that broke was one nobody
 * running these tests could execute, and a line only a remote runner ever reaches is a line
 * nobody is really maintaining. */
export function pathDirsWithoutAidd({
  platform,
  nodeDir,
  gitDir,
  systemRoot,
  holdsShell,
}: PathWithoutAiddInputs): readonly string[] {
  const dirs = [nodeDir];
  if (gitDir) dirs.push(gitDir);
  if (platform === "win32") {
    dirs.push(...gitShellDirs(gitDir, holdsShell), join(systemRoot, "System32"), systemRoot);
  } else {
    dirs.push("/usr/bin", "/bin");
  }
  return dirs;
}

export function pathWithoutAidd(): string {
  return pathDirsWithoutAidd({
    platform: process.platform,
    nodeDir: dirname(process.execPath),
    gitDir: findGitDirWithoutAidd(),
    systemRoot: process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows",
    holdsShell: (dir) => existsSync(join(dir, "sh.exe")),
  }).join(delimiter);
}

// Where a person's own identity file lands under sandboxedEnv, restated rather than
// imported from the adapter: a test that asked the code where it wrote the file could not
// catch the code writing it somewhere else. It was once held to the plugin's own identity
// script as well (#707); the CLI is the only writer now, so this pins `person-identity-adapter.ts`
// alone.
export function identityFileIn(fakeHome: string): string {
  return process.platform === "win32"
    ? join(fakeHome, "AppData", "Roaming", "aidd", "identity.json")
    : join(fakeHome, ".config", "aidd", "identity.json");
}

/**
 * Where a sandboxed run's figures actually land, which is not the same directory on every
 * platform. `sandboxedEnv` below points `APPDATA` inside the fake home, so a Windows run
 * writes under `AppData\Roaming\aidd`, never under `.config`.
 *
 * A test that seeds the sink itself before running is insulated from this by the adapter's
 * legacy-data fallback — a home that already journalled under `.config` keeps landing there.
 * A test that lets the CLI create the sink from nothing is not, and asserting the POSIX path
 * there reads as "nothing was stored" on Windows rather than as a wrong lookup.
 */
export function sinkDirIn(fakeHome: string): string {
  return process.platform === "win32"
    ? join(fakeHome, "AppData", "Roaming", "aidd", "telemetry")
    : join(fakeHome, ".config", "aidd", "telemetry");
}

export function sandboxedEnv(
  fakeHome: string,
  extra?: Record<string, string>,
  options?: { realHome?: boolean }
): NodeJS.ProcessEnv {
  // A minimal PATH, not the runner's own. What a spawned `aidd` can reach decides what it
  // does: the OpenCode reader shells out to an `opencode` binary and waits up to 10s for it,
  // so a machine that happens to have the tool installed pays a cost a machine without it
  // does not. That is how `records stored before opting in stay unnamed` swung between 14s
  // and a 60s timeout across three runs with no code change. A test's result must not depend
  // on which AI tools the person running it happens to have.
  const base = { ...withoutGitEnv(process.env), PATH: pathWithoutAidd(), Path: pathWithoutAidd() };
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

// `realHome: true` leaves `HOME` real so network tools (gh, git, npm) keep their real
// credentials — `resolveAiddConfigDir` (identity) and `resolveHomeDir` (local cost readers)
// never honor `AIDD_USER_CONFIG_DIR`, by design, so both resolve to the developer's real
// profile under this option. `forget --yes` is the one command that deletes what it finds
// there. No test passes `realHome: true` today, but nothing before this line stopped one
// from combining it with `forget` — this makes that specific combination throw instead of
// reaching a real profile's identity file. A deliberate test that genuinely needs both
// should sandbox identity/local-cost resolution some other way rather than removing this.
function refuseRealHomeForget(args: readonly string[], options?: { realHome?: boolean }): void {
  if (options?.realHome && args.includes("forget")) {
    throw new Error(
      "runCli refuses to run `forget` under realHome: true — identity resolution ignores " +
        "AIDD_USER_CONFIG_DIR and would reach the real machine's ~/.config/aidd/identity.json."
    );
  }
}

export async function runCli(
  args: string[],
  cwd: string,
  fakeHome: string,
  options?: { realHome?: boolean; env?: Record<string, string> }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  refuseRealHomeForget(args, options);
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

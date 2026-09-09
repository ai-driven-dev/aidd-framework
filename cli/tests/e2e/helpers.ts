import { execFile } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { copyFile, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { inject } from "vitest";
import { InitUseCase } from "../../src/contexts/framework/application/init-use-case.js";
import { CLIOutput } from "../../src/presentation/output.js";
import { environmentWithoutGitVariables as withoutGitEnv } from "../../src/runtime/git/git-environment.js";
import { createDeps } from "../../src/runtime/wiring/framework.js";

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

/**
 * The binary this run built for itself (tests/e2e/global-setup.ts), published via
 * provide/inject. No fallback to dist/cli.js: that path is shared across concurrent
 * vitest runs, and reading it here is the bug this indirection exists to remove.
 */
function resolveCliPath(): string {
  const cliPath = inject("cliPath");
  if (!cliPath) {
    throw new Error(
      "cliPath is unset: tests/e2e/global-setup.ts did not run. Run e2e tests through " +
        "the e2e vitest project (`pnpm test:e2e` or `vitest run --project e2e`)."
    );
  }
  return cliPath;
}

let cachedCliPath: string | undefined;

/**
 * Resolved on first use, never at import time. A module-level call reached `inject()` while
 * the module graph was still loading, so every file that imported these helpers — including
 * a unit test that only wanted a pure function out of them — died on collection outside the
 * e2e project and contributed zero tests to a run that reported itself green.
 */
export function cliPath(): string {
  cachedCliPath ??= resolveCliPath();
  return cachedCliPath;
}
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

/**
 * The AI tool CLIs this project can drive. A sandboxed run must not reach them: the
 * CLI registers marketplaces through a tool's own command when the binary is there,
 * so leaving them reachable makes the recorded output depend on what the developer
 * happens to have installed — green here, red in CI, for no change in this codebase.
 */
const DRIVABLE_TOOL_BINARIES = ["claude", "codex", "copilot", "cursor-agent"];

/**
 * Whether a directory is free of all of them. Judged by what the directory holds rather
 * than by listing directories to keep, which is what makes this hold on a machine where a
 * tool sits beside everything else — `node` and `copilot` share `/opt/homebrew/bin` on
 * macOS, so callers reach node through `process.execPath` instead of through PATH.
 */
function withoutDrivableToolBinary(dir: string): boolean {
  return DRIVABLE_TOOL_BINARIES.every((binary) => {
    try {
      accessSync(join(dir, binary), constants.X_OK);
      return false;
    } catch {
      return true;
    }
  });
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
 * The directories already on `PATH` that hold a shell, minus any that also hold `aidd`.
 *
 * Git runs a hook by reading its shebang and looking the interpreter up **by name on
 * `PATH`** — `#!/bin/sh` sends it looking for `sh.exe`. `pathWithoutAidd` hands every
 * sandboxed run a deliberately narrow `PATH`, and on POSIX that list already carries `/bin`,
 * so the dependency stayed invisible. On Windows there was no shell on it at all, and every
 * hook failed with `cannot spawn …: No such file or directory` — a message that reads like a
 * missing hook file and is nothing of the sort.
 *
 * Selected by what a directory actually contains, never derived from where `git.exe` lives.
 * An earlier attempt walked one level up from the git directory and looked for `bin` and
 * `usr\bin`, which was measured wrong on the runner this exists for: git resolves there to
 * `C:\Program Files\Git\mingw64\bin`, whose parent holds neither, while the shells sit in
 * `C:\Program Files\Git\usr\bin` and `C:\Program Files\Git\bin` — two levels away and
 * on a different branch. Filtering what is already on `PATH` needs no theory of the layout
 * and cannot be wrong about one.
 */
export function shellDirsWithoutAidd(
  pathDirs: readonly string[],
  holds: (dir: string, name: string) => boolean = hasExecutable
): readonly string[] {
  return [...new Set(pathDirs.filter((dir) => holds(dir, "sh") && !holds(dir, "aidd")))];
}

export interface PathWithoutAiddInputs {
  readonly platform: NodeJS.Platform;
  readonly nodeDir: string;
  readonly gitDir: string | undefined;
  readonly systemRoot: string;
  /** Every directory the ambient `PATH` names — where the shell is picked from on Windows. */
  readonly pathDirs: readonly string[];
  readonly holds: (dir: string, name: string) => boolean;
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
  pathDirs,
  holds,
}: PathWithoutAiddInputs): readonly string[] {
  const dirs = [nodeDir];
  if (gitDir) dirs.push(gitDir);
  if (platform === "win32") {
    dirs.push(...shellDirsWithoutAidd(pathDirs, holds), join(systemRoot, "System32"), systemRoot);
  } else {
    dirs.push("/usr/bin", "/bin");
  }
  return dirs;
}

/**
 * The sandbox `PATH`: narrow by construction, then filtered of any directory holding a
 * drivable tool binary. The narrowing is what keeps `aidd` and a hook's shell honest; the
 * filter is what keeps a tool that ships into `/usr/bin` from being reachable anyway.
 */
export function pathWithoutAidd(): string {
  return pathDirsWithoutAidd({
    platform: process.platform,
    nodeDir: dirname(process.execPath),
    gitDir: findGitDirWithoutAidd(),
    systemRoot: process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows",
    pathDirs: (process.env.PATH ?? "").split(delimiter).filter(Boolean),
    holds: hasExecutable,
  })
    .filter(withoutDrivableToolBinary)
    .join(delimiter);
}

export async function copyFixtureTree(sourceDir: string, destDir: string): Promise<void> {
  await cp(sourceDir, destDir, { recursive: true });
}

// Where a sandboxed run's identity file actually lands, per platform. Derived here and never
// imported from the adapter: a test that asked the code where it wrote the file could not
// catch the code writing it somewhere else.
export function identityFileIn(fakeHome: string): string {
  return process.platform === "win32"
    ? join(fakeHome, "AppData", "Roaming", "aidd", "identity.json")
    : join(fakeHome, ".config", "aidd", "identity.json");
}

/**
 * Where a sandboxed run's figures actually land — the same directory on every platform,
 * never `%APPDATA%`. `sandboxedEnv` sets `AIDD_USER_CONFIG_DIR` unconditionally, to pin the
 * update-check cache out of a real profile, and `TelemetrySinkAdapter`'s constructor honours
 * that variable ahead of its own platform-based `defaultConfigDir()` — so a sandboxed run's
 * sink is `.config/aidd/telemetry` under the fake home regardless of platform. Predicting the
 * platform default here instead agreed with the adapter only by accident on POSIX, where the
 * two paths coincide, and disagreed with it on Windows, where they do not.
 */
export function sinkDirIn(fakeHome: string): string {
  return join(fakeHome, ".config", "aidd", "telemetry");
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
    // Defaults, before `extra`: a caller that passes one of these means to change it —
    // `AIDD_USER_CONFIG_DIR` in particular is what the relocation tests are about. The
    // sandbox's own home variables come after, where nothing can override them.
    //
    // The user directory holds the update-check cache; pinning it keeps a run out of
    // the real one.
    AIDD_USER_CONFIG_DIR: join(fakeHome, ".config", "aidd"),
    // And the check itself asks GitHub what the latest release is, then prints a notice
    // from the answer — so a captured stderr would depend on what has been published
    // since, and every release would rewrite these expectations. Measured: a golden run
    // fetched 5.2.2 mid-run and failed on the notice a later command then printed.
    AIDD_SKIP_UPDATE_CHECK: "1",
    ...extra,
    HOME: fakeHome,
    XDG_CONFIG_HOME: join(fakeHome, ".config"),
    // `HOME` alone only sandboxes POSIX: `os.homedir()` never reads it on Windows, where it
    // reads `USERPROFILE` instead, and the CLI's own Windows config-dir rule reads `APPDATA`
    // ahead of that. Left at the real runner's values, both leak every test's "sandboxed"
    // home straight onto the machine's real profile. Harmless on POSIX, where neither
    // variable is consulted.
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
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath(), ...args], {
      cwd,
      env,
    });
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
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath(), ...args], {
      cwd,
      env,
    });
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

/**
 * A stand-in for a tool's own CLI that records every invocation, one line of arguments
 * per call, and succeeds. On Windows a bare shell script is not executable; what a
 * Windows `PATH` really holds is a `.cmd` shim, so that is what the stand-in is there.
 */
export async function writeFakeToolBinary(
  binDir: string,
  name: string,
  logFile: string
): Promise<void> {
  await mkdir(binDir, { recursive: true });
  if (process.platform === "win32") {
    await writeFile(
      join(binDir, `${name}.cmd`),
      `@echo off\r\necho %* >> "${logFile}"\r\nexit /b 0\r\n`
    );
    return;
  }
  await writeFile(join(binDir, name), `#!/bin/sh\necho "$@" >> "${logFile}"\nexit 0\n`, {
    mode: 0o755,
  });
}

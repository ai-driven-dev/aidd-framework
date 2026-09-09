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
 * No fallback to `dist/cli.js`: that path is shared across concurrent vitest runs, so a run
 * would read another run's binary.
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
 * Resolved on first use, never at import time: `inject()` called while the module graph is
 * still loading kills collection for every file importing this one outside the e2e project.
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
  // Mirror the real ~/.gitconfig so git keeps its identity and credential helpers under the
  // sandboxed HOME.
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
 * A sandboxed run must reach none of these: the CLI registers marketplaces through a tool's
 * own command when its binary is there, making recorded output depend on the machine.
 */
const DRIVABLE_TOOL_BINARIES = ["claude", "codex", "copilot", "cursor-agent"];

/**
 * Judged by what a directory holds, never by a keep-list: `node` and `copilot` share
 * `/opt/homebrew/bin` on macOS, so callers reach node through `process.execPath`.
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

/** Skips, never stops at, a directory carrying both: `git` and a globally-linked `aidd` can
 * share one Homebrew directory, which would readmit the binary the sandbox excludes. */
function findGitDirWithoutAidd(): string | undefined {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir === "") continue;
    if (hasExecutable(dir, "git") && !hasExecutable(dir, "aidd")) return dir;
  }
  return undefined;
}

/**
 * Git looks a hook's shebang interpreter up by name on `PATH`, so the narrow sandbox `PATH`
 * must carry a shell — selected by what a directory holds, never from where `git.exe` lives.
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
  readonly pathDirs: readonly string[];
  readonly holds: (dir: string, name: string) => boolean;
}

/** Pure so the Windows shape can be asserted from any platform. */
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
 * Narrow by construction, then filtered of any directory holding a drivable tool binary —
 * without the filter a tool shipped into `/usr/bin` stays reachable.
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

// Derived here and never imported from the adapter: a test that asked the code where it
// wrote the file could not catch it writing somewhere else.
export function identityFileIn(fakeHome: string): string {
  return process.platform === "win32"
    ? join(fakeHome, "AppData", "Roaming", "aidd", "identity.json")
    : join(fakeHome, ".config", "aidd", "identity.json");
}

/**
 * `sandboxedEnv` always sets `AIDD_USER_CONFIG_DIR`, which `TelemetrySinkAdapter` honours
 * ahead of its platform default — so the sink is under the fake home on every platform.
 */
export function sinkDirIn(fakeHome: string): string {
  return join(fakeHome, ".config", "aidd", "telemetry");
}

export function sandboxedEnv(
  fakeHome: string,
  extra?: Record<string, string>,
  options?: { realHome?: boolean }
): NodeJS.ProcessEnv {
  // A minimal PATH, not the runner's own: the OpenCode reader shells out to an `opencode`
  // binary and waits up to 10s for it, so a machine carrying the tool pays a cost one
  // without it does not.
  const base = { ...withoutGitEnv(process.env), PATH: pathWithoutAidd(), Path: pathWithoutAidd() };
  if (options?.realHome) {
    return { ...base, ...extra, AIDD_USER_CONFIG_DIR: join(fakeHome, ".config", "aidd") };
  }
  return {
    ...base,
    // Defaults, before `extra`: a caller passing one means to change it. The sandbox's own
    // home variables come after, where nothing can override them.
    AIDD_USER_CONFIG_DIR: join(fakeHome, ".config", "aidd"),
    // The check asks GitHub for the latest release and prints a notice from the answer, so
    // captured stderr would change with every publish.
    AIDD_SKIP_UPDATE_CHECK: "1",
    ...extra,
    HOME: fakeHome,
    XDG_CONFIG_HOME: join(fakeHome, ".config"),
    // `HOME` alone only sandboxes POSIX: `os.homedir()` reads `USERPROFILE` on Windows, and
    // the CLI's own Windows config-dir rule reads `APPDATA` ahead of that.
    USERPROFILE: fakeHome,
    APPDATA: join(fakeHome, "AppData", "Roaming"),
  };
}

// Under `realHome: true` neither `resolveAiddConfigDir` (identity) nor `resolveHomeDir`
// (local cost readers) honors `AIDD_USER_CONFIG_DIR`, so `forget --yes` would delete what it
// finds in the developer's real profile.
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

export async function initProject(projectDir: string, _frameworkPath: string): Promise<void> {
  const output = new CLIOutput(false);
  const deps = await createDeps(projectDir, { verbose: false }, output);
  await new InitUseCase(deps.fs, deps.manifestRepo).execute({
    projectRoot: projectDir,
  });
}

/**
 * On Windows a bare shell script is not executable; what a `PATH` really holds is a `.cmd`
 * shim, so that is what the stand-in is written as.
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

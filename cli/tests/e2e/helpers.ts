import { execFile } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import { InitUseCase } from "../../src/contexts/framework/application/init-use-case.js";
import { CLIOutput } from "../../src/presentation/output.js";
import { createDeps } from "../../src/runtime/wiring/framework.js";

export const execFileAsync = promisify(execFile);

const GIT_ENV_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
];

export async function gitInit(cwd: string): Promise<void> {
  const env = { ...process.env };
  for (const key of GIT_ENV_VARS) delete env[key];
  await execFileAsync("git", ["init"], { cwd, env });
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

/**
 * The AI tool CLIs this project can drive. A sandboxed run must not reach them: the
 * CLI registers marketplaces through a tool's own command when the binary is there,
 * so leaving them reachable makes the recorded output depend on what the developer
 * happens to have installed — green here, red in CI, for no change in this codebase.
 */
const DRIVABLE_TOOL_BINARIES = ["claude", "codex", "copilot", "cursor-agent"];

/**
 * PATH with every directory holding one of those binaries removed. Filtering by
 * directory rather than listing directories to keep is what makes this hold on a
 * machine where a tool sits beside everything else — `node` and `copilot` share
 * `/opt/homebrew/bin` on macOS, so callers reach node through `process.execPath`
 * instead of through PATH.
 */
function pathWithoutToolBinaries(): string {
  const dirs = (process.env.PATH ?? "").split(delimiter).filter((dir) => dir !== "");
  return dirs
    .filter((dir) =>
      DRIVABLE_TOOL_BINARIES.every((binary) => {
        try {
          accessSync(join(dir, binary), constants.X_OK);
          return false;
        } catch {
          return true;
        }
      })
    )
    .join(delimiter);
}

function sandboxedEnv(
  fakeHome: string,
  extra?: Record<string, string>,
  options?: { realHome?: boolean }
): NodeJS.ProcessEnv {
  if (options?.realHome) {
    return { ...process.env, ...extra, AIDD_USER_CONFIG_DIR: join(fakeHome, ".config", "aidd") };
  }
  return {
    ...process.env,
    ...extra,
    HOME: fakeHome,
    XDG_CONFIG_HOME: join(fakeHome, ".config"),
    // The user directory holds the update-check cache; pinning it keeps a run out of
    // the real one.
    AIDD_USER_CONFIG_DIR: join(fakeHome, ".config", "aidd"),
    // And the check itself asks GitHub what the latest release is, then prints a notice
    // from the answer — so a captured stderr would depend on what has been published
    // since, and every release would rewrite these expectations. Measured: a golden run
    // fetched 5.2.2 mid-run and failed on the notice a later command then printed.
    AIDD_SKIP_UPDATE_CHECK: "1",
    PATH: pathWithoutToolBinaries(),
  };
}

export async function runCli(
  args: string[],
  cwd: string,
  fakeHome: string,
  options?: { realHome?: boolean }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const env = sandboxedEnv(fakeHome, undefined, options);
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_PATH, ...args], {
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
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_PATH, ...args], {
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

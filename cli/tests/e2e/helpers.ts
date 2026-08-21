import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

function sandboxedEnv(
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

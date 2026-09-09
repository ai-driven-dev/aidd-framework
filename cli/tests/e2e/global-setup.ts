/**
 * Builds this run's own binary, so two vitest invocations never share one `dist/cli.js`.
 * Under `cli/`, never the OS temp dir: Node resolves the external dependencies by walking up.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    cliPath: string;
  }
}

const execFileAsync = promisify(execFile);
const CLI_ROOT = resolve(import.meta.dirname, "..", "..");
// tsup's own entry, run through this very node: the `.bin/tsup` shim is an extensionless
// shell script Windows cannot spawn without a shell.
const TSUP_ENTRY = join(CLI_ROOT, "node_modules", "tsup", "dist", "cli-default.js");
/** Gitignored: one directory per run, removed on teardown. */
const BUILD_ROOT = join(CLI_ROOT, ".e2e-build");
let outDir: string | undefined;

export async function setup(project: TestProject): Promise<void> {
  await mkdir(BUILD_ROOT, { recursive: true });
  outDir = await mkdtemp(join(BUILD_ROOT, "run-"));

  await execFileAsync(process.execPath, [TSUP_ENTRY], {
    cwd: CLI_ROOT,
    env: { ...process.env, AIDD_BUILD_OUT_DIR: outDir },
  });

  project.provide("cliPath", join(outDir, "cli.js"));
}

export async function teardown(): Promise<void> {
  const built = outDir;
  if (built === undefined) return;
  await rm(built, { recursive: true, force: true });
}

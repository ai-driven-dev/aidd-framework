/**
 * Builds a private binary for this e2e run, in a directory only this run knows, so two vitest
 * invocations never share one dist/cli.js. `pnpm test` used to run `tsup` (clean: true)
 * before every run; a second run's rebuild deleted and rewrote the binary the first
 * run's golden suites were still reading mid-capture — the same command captured twice,
 * compared byte for byte, with a rewrite landing between the two captures.
 *
 * Calls tsup directly (never `pnpm build`, which also runs check-bundle-size.mjs against
 * the real dist/cli.js) and publishes the built path via provide/inject: workers spawn
 * after globalSetup returns, so every worker in the e2e project sees it.
 *
 * The directory sits under `cli/`, not the OS temp dir. `skipNodeModulesBundle` leaves the
 * dependencies external, and Node resolves those by walking up from the built file: inside
 * the package it finds `cli/node_modules`, outside it finds nothing and the binary dies on
 * `commander`. Building here needs no symlink to bridge the gap — and no symlink means
 * nothing for tsup's `clean: true` to reach through into the real `node_modules`.
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
const TSUP_BIN = join(CLI_ROOT, "node_modules", ".bin", "tsup");
/** Gitignored: one directory per run, removed on teardown. */
const BUILD_ROOT = join(CLI_ROOT, ".e2e-build");

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  await mkdir(BUILD_ROOT, { recursive: true });
  const outDir = await mkdtemp(join(BUILD_ROOT, "run-"));

  await execFileAsync(TSUP_BIN, [], {
    cwd: CLI_ROOT,
    env: { ...process.env, AIDD_BUILD_OUT_DIR: outDir },
  });

  project.provide("cliPath", join(outDir, "cli.js"));

  return async () => {
    await rm(outDir, { recursive: true, force: true });
  };
}

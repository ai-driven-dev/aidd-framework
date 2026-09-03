#!/usr/bin/env node
/**
 * Runs one mutation scope and files its report under that scope's own name.
 *
 * Stryker writes its html and json reports to one path from the config, so five scopes
 * run in sequence would leave only the last score behind. Moving each report into
 * reports/mutation/<scope>/ is what makes the numbers comparable after the fact — and
 * what makes a figure quoted in a document something a command can reproduce.
 *
 * The scope list lives in mutation-scopes.json, which the architecture test reads too.
 * Two lists disagree eventually; one cannot.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPES = JSON.parse(readFileSync(join(CLI_ROOT, "mutation-scopes.json"), "utf8")).scopes;
const REPORT_ROOT = join(CLI_ROOT, "reports", "mutation");

/** The two paths stryker.conf.json writes, before they are filed by scope. */
const WRITTEN_REPORTS = ["report.html", "mutation.json"];

function usage(problem) {
  console.error(`${problem}\n\nUsage: node scripts/run-mutation.mjs <scope>`);
  console.error(`Scopes: ${Object.keys(SCOPES).join(", ")}`);
  process.exit(1);
}

const scope = process.argv[2];
if (scope === undefined) usage("No scope given.");
if (!Object.hasOwn(SCOPES, scope)) usage(`Unknown scope "${scope}".`);

const result = spawnSync(
  join(CLI_ROOT, "node_modules", ".bin", "stryker"),
  ["run", "--mutate", SCOPES[scope]],
  { cwd: CLI_ROOT, stdio: "inherit" }
);

// Sandboxes survive an interrupted run, and 100 MB of them has blocked a commit hook here
// before. Removed whether the run passed or not.
rmSync(join(CLI_ROOT, ".stryker-tmp"), { recursive: true, force: true });

const scopeDir = join(REPORT_ROOT, scope);
mkdirSync(scopeDir, { recursive: true });
for (const name of WRITTEN_REPORTS) {
  const written = join(REPORT_ROOT, name);
  if (existsSync(written)) renameSync(written, join(scopeDir, name));
}

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`\nReport: reports/mutation/${scope}/`);

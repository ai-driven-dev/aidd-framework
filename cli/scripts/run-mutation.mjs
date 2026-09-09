#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_ROOT = join(CLI_ROOT, "reports", "mutation");

/** The two paths stryker.conf.json writes, before they are filed by scope. */
const WRITTEN_REPORTS = ["report.html", "mutation.json"];

function loadScopes(root = CLI_ROOT) {
  return JSON.parse(readFileSync(join(root, "mutation-scopes.json"), "utf8")).scopes;
}

/** One incremental file per scope: what a run learned about `kernel` says nothing about
 * `tools`, and a shared file would let one scope's result skip another's mutants. */
export function strykerArgs(scope, scopes, { force = false } = {}) {
  const declared = scopes[scope];
  if (declared === undefined) {
    throw new Error(`Unknown scope "${scope}". Scopes: ${Object.keys(scopes).join(", ")}`);
  }
  const args = [
    "run",
    "--mutate",
    [declared.mutate].flat().join(","),
    "--incremental",
    "--incrementalFile",
    `reports/mutation/${scope}/incremental.json`,
  ];
  if (force) args.push("--force");
  return args;
}

/** Stryker's own score: detected (killed, timed out) over detected plus undetected (survived,
 * uncovered); an ignored or errored mutant counts on neither side. No mutant scores zero. */
export function scoreOf(report) {
  let detected = 0;
  let undetected = 0;
  for (const file of Object.values(report.files ?? {})) {
    for (const mutant of file.mutants) {
      if (mutant.status === "Killed" || mutant.status === "Timeout") detected += 1;
      else if (mutant.status === "Survived" || mutant.status === "NoCoverage") undetected += 1;
    }
  }
  const total = detected + undetected;
  return total === 0 ? 0 : (100 * detected) / total;
}

/** Below the declared floor is a failure the run itself raises; stryker's own `thresholds`
 * would need a config file per scope to say the same thing. */
export function breakVerdict(score, declared) {
  if (score < declared.break) {
    return `mutation score ${score.toFixed(1)} is below the ${declared.break} declared in mutation-scopes.json`;
  }
  return null;
}

function usage(problem, scopes) {
  console.error(`${problem}\n\nUsage: node scripts/run-mutation.mjs <scope> [--force]`);
  console.error(`Scopes: ${Object.keys(scopes).join(", ")}`);
  process.exit(1);
}

function main() {
  const scopes = loadScopes();
  const [scope, ...flags] = process.argv.slice(2);
  if (scope === undefined) usage("No scope given.", scopes);
  if (!Object.hasOwn(scopes, scope)) usage(`Unknown scope "${scope}".`, scopes);
  const force = flags.includes("--force");

  const scopeDir = join(REPORT_ROOT, scope);
  mkdirSync(scopeDir, { recursive: true });

  const result = spawnSync(
    join(CLI_ROOT, "node_modules", ".bin", "stryker"),
    strykerArgs(scope, scopes, { force }),
    { cwd: CLI_ROOT, stdio: "inherit" }
  );

  // A sandbox survives an interrupted run and they grow to hundreds of megabytes.
  rmSync(join(CLI_ROOT, ".stryker-tmp"), { recursive: true, force: true });

  for (const name of WRITTEN_REPORTS) {
    const written = join(REPORT_ROOT, name);
    if (existsSync(written)) renameSync(written, join(scopeDir, name));
  }

  if (result.status !== 0) process.exit(result.status ?? 1);

  const report = JSON.parse(readFileSync(join(scopeDir, "mutation.json"), "utf8"));
  const score = scoreOf(report);
  const verdict = breakVerdict(score, scopes[scope]);
  console.log(
    `\nReport: reports/mutation/${scope}/ (score ${score.toFixed(1)}, floor ${scopes[scope].break})`
  );
  if (verdict !== null) {
    console.error(verdict);
    process.exit(1);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

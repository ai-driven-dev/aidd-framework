#!/usr/bin/env node
// Run only the tests the working tree can break.
//
// Vitest resolves which specs import a changed source file, so a change reaches every test
// that could fail because of it without running the ones that cannot. The plugin's own
// specs reach their subject by path rather than by import, so the same question is asked
// of their text: a spec that never names a changed file cannot be broken by it. One that
// names nothing recognisable always runs, since silence is not evidence.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "cli");
const PLUGIN_SUITE_DIR = "scripts/__tests__";

function changedFiles() {
  const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  const tracked = git(["diff", "--name-only", "HEAD"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return `${tracked}\n${untracked}`
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && existsSync(join(ROOT, line)));
}

function run(command, args, cwd) {
  process.stdout.write(`\n$ ${command} ${args.join(" ")}\n`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

const changed = changedFiles();
if (changed.length === 0) {
  process.stdout.write("Nothing changed since HEAD.\n");
  process.exit(0);
}

/** Every path that would reach this file: itself, and each directory above it down to two
 * segments — one segment is a whole tree, which would name every spec. */
function ancestorsOf(file) {
  const parts = file.split("/");
  return parts.map((_, index) => parts.slice(0, index + 1).join("/")).slice(1);
}

/** The specs whose own text names one of the changed files, directly or by a directory
 * above it. A spec is its own dependency, so editing one runs it. */
function pluginSpecsReaching(files) {
  const specs = readdirSync(join(ROOT, PLUGIN_SUITE_DIR)).filter((n) => n.endsWith(".test.js"));
  return specs.filter((spec) => {
    const path = `${PLUGIN_SUITE_DIR}/${spec}`;
    if (files.includes(path)) return true;
    const text = readFileSync(join(ROOT, path), "utf8");
    // A spec that names a directory reaches everything below it, so an ancestor counts as
    // naming the file. Matching only the exact path would let a spec that walks a folder
    // miss the file it just read.
    if (files.some((file) => ancestorsOf(file).some((part) => text.includes(part)))) return true;
    // A spec that names no source of ours reaches its subject some way this cannot see, so
    // it runs: silence is not evidence that nothing broke.
    return !/(plugins|scripts)\//u.test(text);
  });
}

const cliFiles = changed
  .filter((file) => file.startsWith("cli/") && /\.(ts|js|json)$/u.test(file))
  .map((file) => file.slice("cli/".length));
const pluginSpecs = pluginSpecsReaching(
  changed.filter((file) => file.startsWith("plugins/") || file.startsWith("scripts/"))
);

try {
  if (cliFiles.length > 0) run("npx", ["vitest", "related", "--run", ...cliFiles], CLI);
  for (const spec of pluginSpecs) {
    run("node", ["--test", `${PLUGIN_SUITE_DIR}/${spec}`], ROOT);
  }
} catch {
  process.exit(1);
}

if (cliFiles.length === 0 && pluginSpecs.length === 0) {
  process.stdout.write("No change reaches a test.\n");
}

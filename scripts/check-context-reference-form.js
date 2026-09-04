#!/usr/bin/env node
/**
 * check-context-reference-form.js - Fails when a context file's memory block
 * carries a reference in a form its own tool cannot resolve.
 *
 * `CLAUDE.md` takes `@aidd_docs/…` because Claude Code resolves that import.
 * `AGENTS.md`, and the copilot instructions file, take markdown links because the
 * tools reading them do not: an `@` line there is inert text that loads nothing
 * and reports nothing.
 *
 * `plugins/aidd-context/hooks/update_memory.js` already writes the right form.
 * What was missing is anything that notices a file drifting back to the wrong
 * one — through an older copy of that hook still cached on a machine, or a stale
 * edit swept into an unrelated commit. Both have happened.
 *
 * The expected form is read from the hook's own `TARGET_FILES`, never restated
 * here: a second copy of that table could disagree with the one that writes.
 *
 * Usage:
 *   node scripts/check-context-reference-form.js
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const HOOK = path.join(ROOT, "plugins", "aidd-context", "hooks", "update_memory.js");

const BLOCK_OPEN = "<!-- aidd_project_memory:start -->";
const BLOCK_CLOSE = "<!-- aidd_project_memory:end -->";

const TARGET_ENTRY = /\{\s*path:\s*"([^"]+)"\s*,\s*syntax:\s*"(at|link)"\s*\}/gu;
const AT_REFERENCE = /^@(\S+)$/u;
const LINK_REFERENCE = /^\[[^\]]+\]\([^)]+\)$/u;

/** The hook's own table of which file takes which form. Throws rather than
 * returning nothing: a table that cannot be read makes every comparison below
 * vacuous, and a check that passes because it compared against nothing is worse
 * than no check. */
function readDeclaredTargets(hookSource) {
  const targets = [...hookSource.matchAll(TARGET_ENTRY)].map(([, file, syntax]) => ({
    path: file,
    syntax,
  }));
  if (targets.length === 0) {
    throw new Error(
      `No TARGET_FILES entries found in ${path.relative(ROOT, HOOK)}. ` +
        "The hook's table is this check's source of truth; it cannot run without it."
    );
  }
  return targets;
}

/** The form of one line, or `null` when the line is not a reference at all —
 * prose, an html comment and the read-on-demand list all share the block. */
function referenceForm(line) {
  if (AT_REFERENCE.test(line)) return "at";
  if (LINK_REFERENCE.test(line)) return "link";
  return null;
}

/** Every reference in the memory block whose form is not the declared one.
 *
 * A file with no block, and one whose markers are unpaired, both yield nothing:
 * `update_memory.js` reports the unpaired case itself, and two voices for one
 * fault help nobody. */
function referenceFormProblems(content, expected) {
  const lines = content.split("\n");
  const opensAt = lines.findIndex((line) => line.includes(BLOCK_OPEN));
  if (opensAt === -1) return [];
  const closesAt = lines.findIndex((line, index) => index > opensAt && line.includes(BLOCK_CLOSE));
  if (closesAt === -1) return [];

  const problems = [];
  for (let index = opensAt + 1; index < closesAt; index += 1) {
    const found = referenceForm(lines[index].trim());
    if (found !== null && found !== expected) {
      problems.push({ line: index + 1, reference: lines[index].trim(), found });
    }
  }
  return problems;
}

function readFileIfPresent(relPath) {
  const full = path.join(ROOT, relPath);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
}

/** A declared file the repository does not have is skipped: the hook writes to
 * whichever of them exist, and a project carrying only one is a normal state. */
function checkFiles(targets, io = { readFileIfPresent }) {
  const problems = [];
  for (const target of targets) {
    const content = io.readFileIfPresent(target.path);
    if (content === null) continue;
    for (const problem of referenceFormProblems(content, target.syntax)) {
      problems.push({ file: target.path, expected: target.syntax, ...problem });
    }
  }
  return problems;
}

function reportProblems(problems, logger = console.error, successLogger = console.log) {
  if (problems.length === 0) {
    successLogger("✅ context references carry the form their tool resolves");
    return;
  }
  logger(`❌ ${problems.length} reference(s) in a form the reading tool cannot resolve`);
  for (const problem of problems) {
    logger(`  ${problem.file}:${problem.line}  ${problem.reference}`);
    logger(`    declares "${problem.expected}", found "${problem.found}"`);
  }
  logger("  Run the aidd-context memory refresh, or fix the block by hand.");
}

function runCli() {
  const targets = readDeclaredTargets(fs.readFileSync(HOOK, "utf8"));
  const problems = checkFiles(targets);
  reportProblems(problems);
  return problems.length === 0 ? 0 : 1;
}

module.exports = {
  readDeclaredTargets,
  referenceForm,
  referenceFormProblems,
  checkFiles,
  reportProblems,
  runCli,
};

if (require.main === module) process.exit(runCli());

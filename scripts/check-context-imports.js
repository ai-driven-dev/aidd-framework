#!/usr/bin/env node
/**
 * Fails when an `@import` sits inside an HTML block, where a context loader skips it: the
 * file looks correct, loads nothing, and nothing reports it. A block opens on any line
 * starting with `<` and runs to the next blank line — stricter than CommonMark, because
 * not every context loader is a CommonMark parser.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// Anywhere in the tree, not just the root: a monorepo package carries its own.
const CONTEXT_FILENAMES = ["CLAUDE.md", "AGENTS.md", "copilot-instructions.md"];

// Matched by name at any depth. Same set as scripts/check-markdown-links.js, which walks
// the same tree.
const SKIPPED_DIRS = new Set([".git", "node_modules", "worktrees", ".specstory"]);

// Snapshots of older framework versions, kept on the old shape as test input.
const EXCLUDED_PATHS = ["cli/tests/fixtures"];

const IMPORT_LINE = /^\s{0,3}@\S+/u;
const HTML_BLOCK_OPEN = /^\s{0,3}</u;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/u;

function isExcluded(relPath) {
  const normalized = relPath.split(path.sep).join("/");
  return EXCLUDED_PATHS.some((dir) => normalized === dir || normalized.startsWith(`${dir}/`));
}

function collectContextFiles(dir = ROOT, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      if (isExcluded(path.relative(ROOT, full))) continue;
      collectContextFiles(full, found);
    } else if (CONTEXT_FILENAMES.includes(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** Code blocks are skipped: the broken shape is quoted in documentation. */
function findHiddenImports(content) {
  const hidden = [];
  let fence = null;
  let openedAt = null;

  content.split("\n").forEach((line, index) => {
    const opener = FENCE.exec(line);

    if (fence) {
      // A fence closes only on the same character, repeated at least as often.
      if (opener && opener[1][0] === fence[0] && opener[1].length >= fence.length) fence = null;
      return;
    }
    if (opener) {
      fence = opener[1];
      return;
    }
    if (line.trim() === "") {
      openedAt = null;
      return;
    }
    if (openedAt === null && HTML_BLOCK_OPEN.test(line)) {
      openedAt = { line: index + 1, text: line.trim() };
      return;
    }
    if (openedAt !== null && IMPORT_LINE.test(line)) {
      hidden.push({ line: index + 1, import: line.trim(), openedBy: openedAt });
    }
  });

  return hidden;
}

function checkFiles(files) {
  const problems = [];
  for (const file of files) {
    for (const hidden of findHiddenImports(fs.readFileSync(file, "utf8"))) {
      problems.push({ file, ...hidden });
    }
  }
  return problems;
}

function reportProblems(problems, logger = console.error, successLogger = console.log) {
  if (problems.length === 0) {
    successLogger("✅ context imports load: none sit inside an HTML block");
    return;
  }
  logger(`❌ ${problems.length} import(s) never load: inside an HTML block`);
  for (const problem of problems) {
    const where = `${path.relative(ROOT, problem.file)}:${problem.line}`;
    logger(`  ${where}  ${problem.import}`);
    logger(`    inside the block opened line ${problem.openedBy.line} by ${problem.openedBy.text}`);
  }
  logger("  Add a blank line after the opening line, or move the imports out of the block.");
}

function runCli(argv = process.argv.slice(2), logger = console.error) {
  if (argv.length === 0) {
    const problems = checkFiles(collectContextFiles());
    reportProblems(problems);
    return problems.length === 0 ? 0 : 1;
  }

  // A path given explicitly and not read is an error. Skipping it would turn the
  // check into a green no-op, which is the failure it exists to catch.
  const files = argv.map((f) => path.resolve(ROOT, f));
  const missing = files.filter((f) => !fs.existsSync(f) || !fs.statSync(f).isFile());
  if (missing.length > 0) {
    for (const f of missing) logger(`❌ Not a readable file: ${path.relative(ROOT, f)}`);
    return 1;
  }

  const problems = checkFiles(files);
  reportProblems(problems);
  return problems.length === 0 ? 0 : 1;
}

module.exports = { findHiddenImports, checkFiles, reportProblems, collectContextFiles, runCli };

if (require.main === module) process.exit(runCli());

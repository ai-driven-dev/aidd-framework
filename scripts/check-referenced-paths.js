#!/usr/bin/env node
/**
 * check-referenced-paths.js - Fails when this repository's own prose names a path that
 * does not exist.
 *
 * The link checker resolves markdown links. Nothing resolved a path written in backticks,
 * which is how the memory bank and the docs came to name `aidd kanban`, `cli knip:production`
 * and a handful of workflow files under names nobody had typed in months.
 *
 * The regex is deliberately anchored on a real top-level entry rather than on "looks like a
 * path". Widening it to any `a/b` token is what produces 39 findings that are MIME types
 * (`application/json`), context-relative fragments (`domain/ports`) and shell fragments -
 * a gate nobody trusts is a gate nobody reads.
 *
 * Scope is this repository's prose: the root markdown, `docs/`, and `aidd_docs/memory/`.
 * `cli/` carries its own ratchet (cli/tests/architecture/referenced-paths.arch.test.ts).
 *
 * Whole-tree, always: the hook's glob decides only whether this runs, never what it reads.
 * Staging one page re-scans every page, because a path dies when the file it names is
 * deleted - in a commit that touches no page at all.
 *
 * Files, not directories: a token with no extension is skipped, so `plugins/` and
 * `scripts/__tests__/` are outside the reach. Directories drift far less than the files in
 * them, and a bare directory in prose is usually a shape rather than a location.
 *
 * Usage:
 *   node scripts/check-referenced-paths.js
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

/** Scanned areas. Everything here is prose this repository owns and can keep true. */
const SCANNED = ["docs", "aidd_docs/memory"];

/** A reference must start with one of these, so that only a token naming something real at
 * the top level is ever considered. Read from disk: a new directory joins the check by
 * existing, and a deleted one stops being an anchor rather than becoming a false positive. */
function topLevelEntries() {
  return new Set(fs.readdirSync(ROOT).filter((entry) => entry !== ".git"));
}

const BACKTICKED = /`([^`\n]+)`/gu;

/** Every backticked token in `content` that names a repository path. */
function referencedPaths(content, entries = topLevelEntries()) {
  const found = [];
  const lines = content.split("\n");

  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(BACKTICKED)) {
      const token = match[1].trim();
      // A command, a placeholder, a version range or a glob is not a path to resolve.
      if (/[\s<>*$|…]/u.test(token)) continue;
      if (token.startsWith(">") || token.startsWith("=")) continue;

      // Files only. A bare directory is almost always a shape rather than a location -
      // `.claude/skills/` names what a tool reads in someone else's project, not a
      // directory here - and directories drift far less than the files inside them.
      if (!path.extname(token)) continue;

      const head = token.split("/")[0];
      if (!entries.has(head)) continue;

      found.push({ target: token, line: index + 1 });
    }
  }

  return found;
}

/** The references in `files` that resolve to nothing on disk. */
function deadReferences(files) {
  const entries = topLevelEntries();
  const dead = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const { target, line } of referencedPaths(content, entries)) {
      if (!fs.existsSync(path.resolve(ROOT, target))) {
        dead.push({ file, line, target });
      }
    }
  }

  return dead;
}

function markdownUnder(dir) {
  const absolute = path.resolve(ROOT, dir);
  if (!fs.existsSync(absolute)) return [];

  return fs
    .readdirSync(absolute, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

function scannedFiles() {
  const rootMarkdown = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(ROOT, entry.name));

  return [...rootMarkdown, ...SCANNED.flatMap(markdownUnder)];
}

function scanRepository() {
  const files = scannedFiles();
  return { scannedFiles: files.length, dead: deadReferences(files) };
}

function run(logger = console.error, successLogger = console.log) {
  const { scannedFiles: count, dead } = scanRepository();

  if (dead.length === 0) {
    successLogger(`✅ Referenced paths: 0 dead in ${count} files`);
    return 0;
  }

  logger(`❌ ${dead.length} referenced path(s) naming nothing on disk`);
  for (const { file, line, target } of dead) {
    logger(`  ${path.relative(ROOT, file)}:${line}  ${target}`);
  }
  return 1;
}

module.exports = { deadReferences, referencedPaths, scanRepository, run };

if (require.main === module) {
  process.exit(run());
}

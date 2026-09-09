#!/usr/bin/env node
/**
 * Fails when this repository's own prose names a path that does not exist. The link checker
 * resolves markdown links; nothing resolved a path written in backticks.
 *
 * A reference is anchored on a real top-level entry rather than on "looks like a path":
 * widening it to any `a/b` token reports MIME types, context-relative fragments and shell
 * fragments, and a gate nobody trusts is a gate nobody reads.
 *
 * Always whole-tree — the hook's glob decides only whether this runs, never what it reads —
 * because a path dies when the file it names is deleted, in a commit that touches no page.
 * `cli/` carries its own ratchet (cli/tests/architecture/referenced-paths.arch.test.ts).
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

/** Prose this repository owns and can keep true. */
const SCANNED = ["docs", "aidd_docs/memory"];

/** Read from disk: a new directory joins the check by existing, and a deleted one stops
 * being an anchor rather than becoming a false positive. */
function topLevelEntries() {
  return new Set(fs.readdirSync(ROOT).filter((entry) => entry !== ".git"));
}

const BACKTICKED = /`([^`\n]+)`/gu;

function referencedPaths(content, entries = topLevelEntries()) {
  const found = [];
  const lines = content.split("\n");

  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(BACKTICKED)) {
      const token = match[1].trim();
      // A command, a placeholder, a version range or a glob is not a path to resolve.
      if (/[\s<>*$|…]/u.test(token)) continue;
      if (token.startsWith(">") || token.startsWith("=")) continue;

      // Files only: a bare directory is usually a shape rather than a location, and
      // directories drift far less than the files inside them.
      if (!path.extname(token)) continue;

      const head = token.split("/")[0];
      if (!entries.has(head)) continue;

      found.push({ target: token, line: index + 1 });
    }
  }

  return found;
}

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

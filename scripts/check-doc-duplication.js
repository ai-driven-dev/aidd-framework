#!/usr/bin/env node
/**
 * Fails when two documents carry the same sentence. A fact copied into a second page stops
 * being one fact: the copies drift, and a reader who finds the stale one has no way to tell.
 *
 * A sentence, not a paragraph or a hash of the file: a paragraph moves a word and stops
 * matching, and a whole-file measure never names what to fix. Twelve words is the floor
 * because shorter lines are shared phrasing rather than a shared fact.
 *
 * Repetition inside one page is deliberate as often as not, so only cross-file carriers count.
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * Sentences two documents are allowed to share, keyed by the normalised sentence, listing
 * every file allowed to carry it with the reason it is there. The only exception this guard
 * accepts, so an entry costs a decision somebody can read back.
 */
const BASELINE = Object.freeze({});

/** Only prose this repository writes and can keep in one home. */
const SCANNED_DIRECTORIES = ["docs", "aidd_docs/memory", "cli/aidd_docs/memory"];
const SCANNED_FILES = ["README.md", "cli/README.md"];
const SCANNED_GLOBS = ["plugins/*/README.md"];

/** Generated on every commit by lefthook, so a duplicate here is the generator's, not a page's. */
const GENERATED = new Set(["docs/prompts-documentation.md"]);

const MINIMUM_WORDS = 12;

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/u;
/** Mermaid arrives fenced like any other block, so one fence rule covers both. */
const FENCE = /^(?:```|~~~)/u;
const MARKDOWN_LINK = /!?\[([^\]]*)\]\([^)]*\)/gu;
const INLINE_CODE = /`([^`]*)`/gu;
const LIST_OR_QUOTE_MARKER = /^\s*(?:[>*+-]\s+|\d+[.)]\s+)/u;
const SENTENCE_END = /(?<=[.!?])\s+/u;

/**
 * A line break ends a sentence as surely as a period does: this repository's prose is mostly
 * bullets and pointers that carry no terminator, and joining them would hide every duplicate
 * inside a paragraph-sized blob.
 */
function sentencesOf(markdown) {
  const body = markdown.replace(FRONTMATTER, "");
  const found = new Set();
  let inFence = false;

  for (const raw of body.split(/\r?\n/)) {
    if (FENCE.test(raw.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const line = raw.trim();
    if (line.startsWith("#") || line.startsWith("|")) continue;

    for (const piece of line.split(SENTENCE_END)) {
      const sentence = normalise(piece);
      if (sentence.split(" ").filter(Boolean).length >= MINIMUM_WORDS) found.add(sentence);
    }
  }

  return [...found];
}

function normalise(piece) {
  return piece
    .replace(LIST_OR_QUOTE_MARKER, "")
    .replace(MARKDOWN_LINK, "$1")
    .replace(INLINE_CODE, "$1")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/u, "");
}

/** Which files carry each sentence, in the order the caller handed the files over. */
function carriersOf(filesToText) {
  const carriers = new Map();

  for (const [file, text] of Object.entries(filesToText)) {
    for (const sentence of sentencesOf(text)) {
      if (!carriers.has(sentence)) carriers.set(sentence, []);
      carriers.get(sentence).push(file);
    }
  }

  return carriers;
}

function findDuplicates(filesToText, baseline = BASELINE) {
  const duplicates = [];

  for (const [sentence, files] of carriersOf(filesToText)) {
    const allowed = baseline[sentence] ?? {};
    const reported = files.filter((file) => !(file in allowed));
    if (reported.length > 1) duplicates.push({ sentence, files: reported });
  }

  return duplicates;
}

/** An allowance outlives its reason the moment one listed file stops carrying the sentence. */
function staleBaseline(filesToText, baseline = BASELINE) {
  const carriers = carriersOf(filesToText);
  const stale = [];

  for (const [sentence, allowed] of Object.entries(baseline)) {
    const files = carriers.get(sentence) ?? [];
    for (const file of Object.keys(allowed)) {
      if (!files.includes(file)) {
        stale.push(
          `${file} no longer carries "${sentence}" - drop it from BASELINE`
        );
      }
    }
  }

  return stale;
}

function markdownUnder(root, directory) {
  const absolute = path.resolve(root, directory);
  if (!fs.existsSync(absolute)) return [];

  return fs
    .readdirSync(absolute, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.relative(root, path.join(entry.parentPath ?? entry.path, entry.name)));
}

/** One shape only, a named file one directory down: a glob engine would be a dependency for
 * a single pattern. */
function matchingGlob(root, glob) {
  const [parent, , name] = glob.split("/");
  const absolute = path.resolve(root, parent);
  if (!fs.existsSync(absolute)) return [];

  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(absolute, entry.name, name)))
    .map((entry) => path.posix.join(parent, entry.name, name));
}

function scannedFiles(root) {
  const found = [
    ...SCANNED_FILES.filter((file) => fs.existsSync(path.resolve(root, file))),
    ...SCANNED_GLOBS.flatMap((glob) => matchingGlob(root, glob)),
    ...SCANNED_DIRECTORIES.flatMap((directory) => markdownUnder(root, directory)),
  ].map((file) => file.split(path.sep).join("/"));

  // CATALOG.md is regenerated from the tree it indexes, so its lines are an output.
  return found.filter((file) => !GENERATED.has(file) && path.basename(file) !== "CATALOG.md");
}

function scanRepository(root = process.cwd()) {
  const files = scannedFiles(root);
  const filesToText = Object.fromEntries(
    files.map((file) => [file, fs.readFileSync(path.resolve(root, file), "utf8")])
  );

  return {
    scannedFiles: files.length,
    duplicates: findDuplicates(filesToText),
    stale: staleBaseline(filesToText),
  };
}

function run(root = process.cwd(), logger = console.error, successLogger = console.log) {
  const { scannedFiles: count, duplicates, stale } = scanRepository(root);

  if (duplicates.length === 0 && stale.length === 0) {
    successLogger(`✅ Doc duplication: 0 duplicated sentence(s) in ${count} files`);
    return 0;
  }

  if (duplicates.length > 0) {
    logger(`❌ ${duplicates.length} sentence(s) carried by more than one document`);
    for (const { sentence, files } of duplicates) {
      logger(`  "${sentence}"`);
      for (const file of files) logger(`    ${file}`);
    }
    logger("keep it in one home and point the others at it");
  }

  if (stale.length > 0) {
    logger(`❌ ${stale.length} BASELINE entry(ies) no longer describing the tree`);
    for (const line of stale) logger(`  ${line}`);
  }

  return 1;
}

module.exports = { BASELINE, findDuplicates, scanRepository, sentencesOf, staleBaseline, run };

if (require.main === module) {
  process.exit(run());
}

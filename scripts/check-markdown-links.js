#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const HELP_TEXT = `Usage:
  node scripts/check-markdown-links.js [--ignore path]

Supported link forms:
  - Markdown links and images: [label](path), ![alt](path)
  - Agent context includes/imports: @path/to/file.md
  - Source declarations: src: path/to/file.md

Ignored / excluded forms:
  - Anchor-only links such as #usage
  - mailto: and tel: links
  - HTML angle-bracket links and HTML attributes
  - .git and node_modules directories, plus .stryker-tmp and .e2e-build, which copy the tree
  - Runtime variables, glob patterns, and bare words
  - cli/tests/fixtures/** (synthetic mock trees) and cli/aidd_docs/tasks/**
    (historical task records), always, on top of any --ignore given

How to fix broken links:
  | Need | Use |
  | - | - |
  | Include/import a file in agent context | @path/to/file.md |
  | Reference a file for the reader | [label](path/to/file.md) |

Examples:
  | Case | Example |
  | - | - |
  | Agent include/import | @plugins/aidd-context/skills/11-explore/SKILL.md |
  | Reader reference | See [explore skill](plugins/aidd-context/skills/11-explore/SKILL.md). |
`;

const SKIPPED_DIRS = new Set([".git", "node_modules", "worktrees", ".specstory", ".stryker-tmp", ".e2e-build"]);
const SKIPPED_DIR_PREFIXES = [".tmp-check-markdown-links-"];
// Always ignored, never a --ignore convenience: both trees hold targets meant not to
// resolve — synthetic mock references, and a historical record left as it was written.
const DEFAULT_IGNORES = ["cli/tests/fixtures", "cli/aidd_docs/tasks"];
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
function normalizePathForDisplay(filePath) {
  const relative = path.relative(ROOT, filePath).replaceAll(path.sep, "/");
  return relative || ".";
}

function normalizeForMatch(filePath) {
  return path.resolve(ROOT, filePath);
}

function pathStartsWith(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseArgs(argv) {
  const paths = [];
  const ignores = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      return { help: true, paths, ignores };
    }

    if (arg === "--ignore") {
      const ignoredPath = argv[index + 1];
      if (!ignoredPath || ignoredPath.startsWith("--")) {
        throw new Error("--ignore requires a path");
      }
      ignores.push(ignoredPath);
      index += 1;
      continue;
    }

    paths.push(arg);
  }

  return { help: false, paths: paths.length > 0 ? paths : ["."], ignores };
}

function isIgnored(filePath, ignoredPaths) {
  const absolute = path.resolve(filePath);
  return ignoredPaths.some((ignoredPath) => pathStartsWith(absolute, ignoredPath));
}

function collectMarkdownFiles(inputPaths, ignoredPaths = []) {
  const files = [];
  const normalizedIgnores = ignoredPaths.map((ignoredPath) => normalizeForMatch(ignoredPath));
  const missingInputs = inputPaths.filter((inputPath) => !fs.existsSync(path.resolve(ROOT, inputPath)));

  if (missingInputs.length > 0) {
    throw new Error(`Path not found: ${missingInputs.join(", ")}`);
  }

  function visit(currentPath) {
    const absolute = path.resolve(ROOT, currentPath);
    if (!fs.existsSync(absolute)) {
      return;
    }

    if (isIgnored(absolute, normalizedIgnores)) {
      return;
    }

    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      const basename = path.basename(absolute);
      if (SKIPPED_DIRS.has(basename) || SKIPPED_DIR_PREFIXES.some((prefix) => basename.startsWith(prefix))) {
        return;
      }

      for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        visit(path.join(absolute, entry.name));
      }
      return;
    }

    if (stat.isFile() && MARKDOWN_EXTENSIONS.has(path.extname(absolute).toLowerCase())) {
      files.push(absolute);
    }
  }

  for (const inputPath of inputPaths) {
    visit(inputPath);
  }

  return files.sort((a, b) => normalizePathForDisplay(a).localeCompare(normalizePathForDisplay(b)));
}

function gatherMarkdownFiles(inputs, cwd = ROOT) {
  return collectMarkdownFiles(inputs.length > 0 ? inputs : ["."], []).map((file) => path.resolve(cwd, path.relative(ROOT, file)));
}

function filterIgnoredFiles(files, ignore = [], root = ROOT) {
  if (ignore.length === 0) {
    return files;
  }

  const ignoredPaths = ignore.map((ignoredPath) => path.resolve(root, ignoredPath));
  return files.filter((file) => !isIgnored(file, ignoredPaths));
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

function stripTrailingPunctuation(target) {
  return target.replace(/[.,;:]+$/u, "");
}

function splitMarkdownTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed;
  }
  return trimmed.split(/\s+/u)[0];
}

function extractLinks(content) {
  const links = [];
  const markdownLinkPattern = /!?\[[^\]\n]*\]\(([^)\n]+)\)/gu;
  const atPathPattern = /(^|[\n\r][ \t>*-]*)@([^\s`)\]},;]+)/gu;
  const srcPathPattern = /\bsrc:\s*([^\s`)\]},;]+)/gu;

  for (const match of content.matchAll(markdownLinkPattern)) {
    links.push({
      raw: splitMarkdownTarget(match[1]),
      index: match.index,
      kind: "markdown",
    });
  }

  for (const match of content.matchAll(atPathPattern)) {
    links.push({
      raw: `@${stripTrailingPunctuation(match[2])}`,
      index: match.index + match[1].length,
      kind: "agent-import",
    });
  }

  for (const match of content.matchAll(srcPathPattern)) {
    links.push({
      raw: stripTrailingPunctuation(match[1]),
      index: match.index,
      kind: "src",
    });
  }

  return links;
}

function isIgnoredTarget(target) {
  if (!target) {
    return true;
  }

  if (target.startsWith("<") && target.endsWith(">")) {
    return true;
  }

  if (/[<>]/u.test(target)) {
    return true;
  }

  if (target.startsWith("#")) {
    return true;
  }

  if (/^(mailto|tel):/iu.test(target)) {
    return true;
  }

  if (/[*?[\]]/u.test(target)) {
    return true;
  }

  if (/^\$[\w_]+/u.test(target)) {
    return true;
  }

  if (/\{\{[^}]+\}\}/u.test(target)) {
    return true;
  }

  if (!target.includes("/") && !target.includes(".") && !target.startsWith("..")) {
    return true;
  }

  return false;
}

function stripAnchor(target) {
  const hashIndex = target.indexOf("#");
  return hashIndex === -1 ? target : target.slice(0, hashIndex);
}

function anchorOf(target) {
  const hashIndex = target.indexOf("#");
  return hashIndex === -1 ? "" : target.slice(hashIndex + 1);
}

/** GitHub's rule, reproduced: nothing is collapsed, which is why a leading emoji leaves
 * the hyphen it was separated by and an `&` leaves two. */
function headingSlug(text) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replaceAll(" ", "-");
}

/** A duplicate heading takes GitHub's `-1`, `-2` suffix, so both the bare slug and the
 * numbered one resolve. */
function headingSlugs(absolutePath) {
  const slugs = new Set();
  const seen = new Map();
  let inFence = false;

  for (const line of fs.readFileSync(absolutePath, "utf8").split("\n")) {
    if (/^\s*(```|~~~)/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = line.match(/^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/u);
    if (!heading) continue;

    const base = headingSlug(heading[1]);
    if (!base) continue;

    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }

  return slugs;
}

function safeDecodeUri(target) {
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
}

function isRemoteUrl(target) {
  return /^https?:\/\//iu.test(target);
}

function resolveLocalPath(target, sourceFile) {
  const withoutAnchor = stripAnchor(target);
  if (!withoutAnchor) {
    return { ignored: true };
  }

  const decoded = safeDecodeUri(withoutAnchor);
  if (path.isAbsolute(decoded)) {
    return { absolute: path.resolve(ROOT, decoded.slice(1)) };
  }

  const absolute = path.resolve(path.dirname(sourceFile), decoded);
  const sourceRelative = normalizePathForDisplay(sourceFile);
  const assetTemplateMatch = sourceRelative.match(/^(plugins\/[^/]+\/skills\/[^/]+\/assets)\/.+$/u);
  if (assetTemplateMatch) {
    const generatedTemplateAbsolute = path.resolve(ROOT, assetTemplateMatch[1], "templates", decoded);
    if (!fs.existsSync(absolute) && fs.existsSync(generatedTemplateAbsolute)) {
      return { absolute: generatedTemplateAbsolute };
    }
    // A *-template.md scaffold links to siblings emitted at runtime, so a dot-relative
    // target resolving nowhere is a placeholder rather than a broken link.
    if (!fs.existsSync(absolute) && /-template\.md$/u.test(sourceRelative) && /^\.\.?\//u.test(decoded)) {
      return { ignored: true };
    }
  }

  if (normalizePathForDisplay(sourceFile).startsWith(".github/")) {
    const repoRootAbsolute = path.resolve(ROOT, decoded);
    if (!fs.existsSync(absolute) && fs.existsSync(repoRootAbsolute)) {
      return { absolute: repoRootAbsolute };
    }
  }

  return { absolute };
}

function problemForTarget(target, sourceFile) {
  const validationTarget = target.startsWith("@") ? target.slice(1) : target;

  if (isIgnoredTarget(validationTarget)) {
    return null;
  }

  if (isRemoteUrl(validationTarget)) {
    return null;
  }

  const resolved = resolveLocalPath(validationTarget, sourceFile);
  if (resolved.ignored) {
    return null;
  }

  if (!pathStartsWith(resolved.absolute, ROOT)) {
    const repoRelative = path.relative(ROOT, resolved.absolute).replaceAll(path.sep, "/");
    return {
      raw: target,
      reason: "cross-repo-relative-link",
      suggestion: `https://github.com/ai-driven-dev/framework/blob/main/${repoRelative.replace(/^(\.\.\/)+/u, "")}`,
    };
  }

  if (!fs.existsSync(resolved.absolute)) {
    return { raw: target, reason: "local-path-not-found" };
  }

  // A fragment is checked only once the file itself resolves, or a missing file reports
  // twice for one fix. `#L119` is GitHub's line fragment: it answers to no heading.
  const anchor = /^L\d+(-L\d+)?$/u.test(anchorOf(validationTarget)) ? "" : anchorOf(validationTarget);
  if (anchor && MARKDOWN_EXTENSIONS.has(path.extname(resolved.absolute).toLowerCase())) {
    if (!headingSlugs(resolved.absolute).has(safeDecodeUri(anchor).toLowerCase())) {
      return { raw: target, reason: "anchor-not-found" };
    }
  }

  return null;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const links = extractLinks(content);
  const problems = [];

  for (const link of links) {
    const problem = problemForTarget(link.raw, filePath);
    if (!problem) {
      continue;
    }

    problems.push({
      ...problem,
      file: filePath,
      line: lineNumberAt(content, link.index),
      kind: link.kind,
    });
  }

  return problems;
}

function checkMarkdownLinks(pathsToCheck, ignoredPaths = []) {
  const files = collectMarkdownFiles(pathsToCheck, ignoredPaths);
  const problems = files.flatMap((file) => checkFile(file));
  return { files, problems };
}

function findBrokenLinks(files) {
  return files.flatMap((file) => checkFile(file));
}

function issueLink(problem) {
  return problem.raw ?? problem.link;
}

function issueReason(problem) {
  if (problem.reason) {
    return problem.reason;
  }

  switch (problem.type) {
    case "cross-repo":
      return "cross-repo-relative-link";
    case "broken-remote":
      return "remote-url-not-found";
    case "broken-template":
      return "template-path-not-found";
    default:
      return problem.type;
  }
}

function formatIssue(problem) {
  const link = issueLink(problem);

  switch (issueReason(problem)) {
    case "cross-repo-relative-link":
      return `${link} (cross-repo relative link; suggestion: ${problem.suggestion})`;
    case "remote-url-not-found":
      return `${link} (remote URL not found locally)`;
    case "template-path-not-found":
      return `${link} (template path not found in framework source)`;
    case "local-path-not-found":
      return `${link} (local path not found)`;
    case "anchor-not-found":
      return `${link} (no heading in the target file answers that fragment)`;
    default:
      return `${link} (file not found)`;
  }
}

function escapeMarkdownTableCell(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function reportProblems(problems, checkedFileCount, logger = console.error, successLogger = console.log) {
  if (problems.length === 0) {
    successLogger(`✅ Links: 0 broken in ${checkedFileCount} files`);
    return 0;
  }

  logger("| source | issue |");
  logger("| - | - |");

  for (const problem of problems) {
    const source = `${normalizePathForDisplay(problem.file)}:${problem.line}`;
    logger(`| ${escapeMarkdownTableCell(source)} | ${escapeMarkdownTableCell(formatIssue(problem))} |`);
  }

  logger("");
  logger(`❌ Links: ${problems.length} broken in ${checkedFileCount} files`);
  return 1;
}

function runCli(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error("Run with --help for usage.");
    return 1;
  }

  if (parsed.help) {
    console.log(HELP_TEXT);
    return 0;
  }

  try {
    const { files, problems } = checkMarkdownLinks(parsed.paths, [...DEFAULT_IGNORES, ...parsed.ignores]);
    reportProblems(problems, files.length);
    return problems.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`❌ ${error.message}`);
    return 1;
  }
}

function run(inputs, { ignore = [] } = {}) {
  try {
    const { files, problems } = checkMarkdownLinks(inputs && inputs.length > 0 ? inputs : ["."], ignore);
    reportProblems(problems, files.length);
    return problems.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`❌ ${error.message}`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  HELP_TEXT,
  checkFile,
  checkMarkdownLinks,
  collectMarkdownFiles,
  extractLinks,
  filterIgnoredFiles,
  formatIssue,
  gatherMarkdownFiles,
  findBrokenLinks,
  parseArgs,
  problemForTarget,
  reportProblems,
  run,
  runCli,
};

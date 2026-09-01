#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SKILL_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLED_DIRECTORY = path.join(SKILL_DIRECTORY, "assets", "recipes");
const PROJECT_DIRECTORY = path.join(process.cwd(), "aidd_docs", "recipes");
const STEP_PATTERN = /^(#{3,4})\s+(\d+)\)\s+(\S+)\s+(.+?)\s*$/u;
const HEADING_PATTERN = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u;
const LINK_PATTERN = /(!?)\[[^\]\n]*\]\(([^)\n]+)\)/gu;
const HTML_TAGS = new Set([
  "a", "article", "aside", "body", "br", "button", "code", "details", "div", "em",
  "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr",
  "html", "i", "iframe", "img", "input", "label", "li", "link", "main", "meta", "nav",
  "ol", "option", "p", "path", "picture", "pre", "script", "section", "select", "small",
  "source", "span", "strong", "style", "summary", "svg", "table", "tbody", "td", "template",
  "textarea", "tfoot", "th", "thead", "title", "tr", "ul", "video",
]);
const ANGLE_SYNTAX_LANGUAGES = new Set([
  "c", "c++", "cpp", "cs", "csharp", "go", "html", "java", "jsx", "kotlin", "objc",
  "objective-c", "rust", "svg", "swift", "tsx", "xml",
]);

function maskHtmlComments(content) {
  return content.replace(/<!--[\s\S]*?-->/gu, (comment) => comment.replace(/[^\n]/gu, " "));
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

function addFinding(findings, file, line, rule, fix) {
  findings.push({ file, line: Math.max(1, line), rule, fix });
}

function scanFences(lines, file, findings) {
  const fencedLines = new Set();
  const blocks = [];
  let open = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);

    if (!open) {
      if (!match) continue;
      const language = match[2].trim().split(/\s+/u)[0] ?? "";
      if (!language) {
        addFinding(findings, file, index + 1, "fence-language", "Add a language after the opening fence, such as ```bash or ```text.");
      }
      open = {
        marker: match[1][0],
        length: match[1].length,
        start: index,
        language: language.toLowerCase(),
      };
      fencedLines.add(index);
      continue;
    }

    fencedLines.add(index);
    if (
      match &&
      match[1][0] === open.marker &&
      match[1].length >= open.length &&
      match[2].trim() === ""
    ) {
      blocks.push({
        ...open,
        end: index,
        body: lines.slice(open.start + 1, index).join("\n"),
      });
      open = null;
    }
  }

  if (open) {
    addFinding(findings, file, open.start + 1, "fence-balance", "Close this fenced code block with the same marker.");
  }

  return { fencedLines, blocks };
}

function parseHeadings(lines, fencedLines) {
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (fencedLines.has(index)) continue;
    const match = lines[index].match(HEADING_PATTERN);
    if (!match) continue;
    headings.push({
      depth: match[1].length,
      text: match[2].trim(),
      line: index + 1,
      index,
    });
  }
  return headings;
}

function baseSlug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/gu, "")
    .replace(/[`*_~]/gu, "")
    .replace(/[\u200d\ufe0e\ufe0f]/gu, "")
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/gu, "-");
}

function headingAnchors(content) {
  const masked = maskHtmlComments(content);
  const lines = masked.split(/\r?\n/u);
  const { fencedLines } = scanFences(lines, "", []);
  const counts = new Map();
  const anchors = new Set();

  for (const heading of parseHeadings(lines, fencedLines)) {
    const slug = baseSlug(heading.text);
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  return anchors;
}

function normalizedAnchor(raw) {
  try {
    return decodeURIComponent(raw.replace(/^#/u, ""))
      .toLowerCase()
      .replace(/[\u200d\ufe0e\ufe0f]/gu, "");
  } catch {
    return raw.replace(/^#/u, "").toLowerCase().replace(/[\u200d\ufe0e\ufe0f]/gu, "");
  }
}

function splitTarget(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("<") && trimmed.includes(">")) {
    return trimmed.slice(1, trimmed.indexOf(">"));
  }
  return trimmed.split(/\s+["']/u)[0];
}

function checkLinks(content, fencedLines, file, findings, anchors) {
  const cache = new Map([[file, anchors]]);

  for (const match of content.matchAll(LINK_PATTERN)) {
    const line = lineNumberAt(content, match.index);
    if (fencedLines.has(line - 1)) continue;

    const target = splitTarget(match[2]);
    if (!target || /^(?:https?|mailto|tel|codex):/iu.test(target)) continue;

    const hashIndex = target.indexOf("#");
    const rawPath = hashIndex === -1 ? target : target.slice(0, hashIndex);
    const rawAnchor = hashIndex === -1 ? "" : target.slice(hashIndex + 1);
    let targetFile = file;

    if (rawPath) {
      let decodedPath = rawPath;
      try {
        decodedPath = decodeURI(rawPath);
      } catch {
        addFinding(findings, file, line, "link-encoding", `Encode the link target correctly: ${rawPath}`);
        continue;
      }
      targetFile = path.resolve(path.dirname(file), decodedPath);
      if (!fs.existsSync(targetFile)) {
        addFinding(findings, file, line, match[1] ? "image-target" : "link-target", `Point the local target to an existing file: ${rawPath}`);
        continue;
      }
    }

    if (!rawAnchor) continue;
    if (!targetFile.toLowerCase().endsWith(".md")) {
      addFinding(findings, file, line, "link-anchor", `Remove the anchor or target a Markdown heading: #${rawAnchor}`);
      continue;
    }

    if (!cache.has(targetFile)) {
      cache.set(targetFile, headingAnchors(fs.readFileSync(targetFile, "utf8")));
    }
    const targetAnchors = cache.get(targetFile);
    if (!targetAnchors.has(normalizedAnchor(rawAnchor))) {
      addFinding(findings, file, line, "link-anchor", `Point the link to an existing heading: #${rawAnchor}`);
    }
  }
}

function hasTable(lines) {
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (/^\s*\|.*\|\s*$/u.test(lines[index]) && /^\s*\|?\s*:?-{3,}/u.test(lines[index + 1])) return true;
  }
  return false;
}

function isProseLine(line) {
  const trimmed = line.trim();
  return Boolean(trimmed) &&
    !/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|~~~|!\[)/u.test(trimmed);
}

function isSingleCompleteSentence(value) {
  const trimmed = value.trim();
  return /[.!?]$/u.test(trimmed) && (trimmed.match(/[.!?](?=\s|$)/gu)?.length ?? 0) === 1;
}

function findAnglePlaceholders(content) {
  const matches = [];

  for (const match of content.matchAll(/<([a-z][a-z0-9_.-]*(?:\s+[a-z][a-z0-9_.-]*)*)>/gu)) {
    const value = match[1];
    if (!value.includes(" ") && (HTML_TAGS.has(value) || content.includes(`</${value}>`))) continue;
    matches.push(match);
  }

  return matches;
}

function maskAngleSyntaxBlocks(content, blocks) {
  const lines = content.split(/\r?\n/u);
  for (const block of blocks) {
    if (!ANGLE_SYNTAX_LANGUAGES.has(block.language)) continue;
    for (let index = block.start; index <= block.end; index += 1) {
      lines[index] = lines[index].replace(/[^\r\n]/gu, " ");
    }
  }
  return lines.join("\n");
}

function checkSteps(lines, headings, stepsHeading, file, findings, fencedLines) {
  const nextH2 = headings.find((heading) => heading.depth === 2 && heading.index > stepsHeading.index);
  const endIndex = nextH2?.index ?? lines.length;
  const scopedHeadings = headings.filter(
    (heading) => heading.index > stepsHeading.index && heading.index < endIndex && [3, 4].includes(heading.depth),
  );
  const steps = [];
  const categories = [];

  for (const heading of scopedHeadings) {
    const source = `${"#".repeat(heading.depth)} ${heading.text}`;
    const match = source.match(STEP_PATTERN);
    if (match) {
      const icon = match[3];
      if (!/\p{Extended_Pictographic}/u.test(icon)) {
        addFinding(findings, file, heading.line, "step-emoji", "Add one meaningful emoji between the step number and title.");
      }
      steps.push({ ...heading, number: Number.parseInt(match[2], 10), icon, title: match[4] });
      continue;
    }

    if (/^\d+[.)]?\s/u.test(heading.text)) {
      addFinding(findings, file, heading.line, "step-heading", "Use `### N) <emoji> Title`, or `#### N) <emoji> Title` below a category.");
    } else if (heading.depth === 3) {
      categories.push(heading);
    } else {
      addFinding(findings, file, heading.line, "category-depth", "Use level 3 for a category and level 4 only for its numbered steps.");
    }
  }

  if (steps.length === 0) {
    addFinding(findings, file, stepsHeading.line, "steps-missing", "Add at least one numbered step heading.");
    return [];
  }

  steps.forEach((step, index) => {
    const expected = index + 1;
    if (step.number !== expected) {
      addFinding(findings, file, step.line, "step-number", `Renumber this step to ${expected}; numbering must start at 1 and remain continuous.`);
    }
  });

  if (categories.length > 0) {
    for (const step of steps) {
      if (step.depth !== 4) {
        addFinding(findings, file, step.line, "step-depth", "Use level 4 for every numbered step when level 3 categories are present.");
        continue;
      }
      const parent = [...categories].reverse().find((category) => category.index < step.index);
      if (!parent) {
        addFinding(findings, file, step.line, "step-parent", "Place this level 4 step below a level 3 category.");
      }
    }
  } else {
    for (const step of steps) {
      if (step.depth !== 3) {
        addFinding(findings, file, step.line, "step-depth", "Use level 3 for direct numbered steps.");
      }
    }
  }

  for (const step of steps) {
    const nextBoundary = headings.find(
      (heading) => heading.index > step.index && heading.index < endIndex && heading.depth <= step.depth,
    );
    const stepEnd = nextBoundary?.index ?? endIndex;
    const body = lines.slice(step.index + 1, stepEnd);
    const firstProseIndex = body.findIndex((line) => isProseLine(line));

    if (firstProseIndex === -1) {
      addFinding(findings, file, step.line, "step-prose", "Start the step with one prose sentence stating its benefit or risk.");
    } else {
      const firstMeaningful = body.findIndex((line) => line.trim() !== "");
      if (firstProseIndex !== firstMeaningful || !isSingleCompleteSentence(body[firstProseIndex])) {
        addFinding(findings, file, step.line + firstProseIndex + 1, "step-prose", "Make the first non-empty line one complete benefit or risk sentence.");
      }
    }

    const hasFence = body.some((_, offset) => fencedLines.has(step.index + 1 + offset));
    const hasImage = body.some((line) => /!\[[^\]]*\]\([^)]+\)/u.test(line));
    if (!hasFence && !hasImage && !hasTable(body)) {
      addFinding(findings, file, step.line, "step-example", "Add a fenced command/config/output, a concrete table, or an operational image.");
    }
  }

  return steps;
}

export function validateRecipe(filePath) {
  const file = path.resolve(filePath);
  const findings = [];

  if (!fs.existsSync(file)) {
    addFinding(findings, file, 1, "file-exists", "Pass an existing recipe path.");
    return findings;
  }
  if (!fs.statSync(file).isFile() || path.extname(file).toLowerCase() !== ".md") {
    addFinding(findings, file, 1, "file-type", "Pass a Markdown recipe file ending in .md.");
    return findings;
  }

  const content = fs.readFileSync(file, "utf8");
  const masked = maskHtmlComments(content);
  const lines = masked.split(/\r?\n/u);
  const { fencedLines, blocks } = scanFences(lines, file, findings);
  const headings = parseHeadings(lines, fencedLines);
  const h1s = headings.filter((heading) => heading.depth === 1);
  let descriptionIndex = -1;

  if (h1s.length !== 1 || h1s[0]?.index !== 0) {
    addFinding(findings, file, h1s[0]?.line ?? 1, "title", "Start the file with exactly one H1 title.");
  }

  const title = h1s[0];
  if (title) {
    descriptionIndex = lines.findIndex((line, index) => index > title.index && line.trim() !== "");
    const description = descriptionIndex === -1 ? "" : lines[descriptionIndex].trim();
    if (
      !description ||
      /^(?:#|[-*+]|>|\||```|~~~|!\[)/u.test(description) ||
      !isSingleCompleteSentence(description)
    ) {
      addFinding(findings, file, descriptionIndex + 1 || title.line + 1, "description", "Put one plain, complete description sentence directly after the H1.");
    }
  }

  for (let index = 1; index < headings.length; index += 1) {
    const previous = headings[index - 1];
    const current = headings[index];
    if (current.depth > previous.depth + 1) {
      addFinding(findings, file, current.line, "heading-depth", `Use level ${previous.depth + 1} or shallower after the previous heading.`);
    }
  }

  const h2s = headings.filter((heading) => heading.depth === 2);
  const whyHeadings = h2s.filter((heading) => /^Why(?:\s|$)/iu.test(heading.text));
  const stepsHeadings = h2s.filter((heading) => /^Steps to\s+\S/u.test(heading.text));
  const verifyHeadings = h2s.filter((heading) => /^Verify(?:\s|$)/u.test(heading.text));

  for (const whyHeading of whyHeadings) {
    addFinding(findings, file, whyHeading.line, "redundant-section", "Remove `## Why`; keep the outcome in the description and benefits or risks in their techniques.");
  }
  if (stepsHeadings.length !== 1) {
    addFinding(findings, file, stepsHeadings[0]?.line ?? 1, "steps-section", "Add exactly one outcome-specific `## Steps to ...` section.");
  }
  if (verifyHeadings.length > 1) {
    addFinding(findings, file, verifyHeadings[1].line, "verify-section", "Keep at most one `## Verify` section.");
  }

  const stepsHeading = stepsHeadings[0];
  if (title && stepsHeading && descriptionIndex !== -1) {
    const extraIntroLine = lines.findIndex(
      (line, index) => index > descriptionIndex && index < stepsHeading.index &&
        line.trim() !== "" && !/^#{1,6}\s/u.test(line) &&
        !/^\s*-\s+\[[^\]]+\]\(#[^)]+\)\s*$/u.test(line),
    );
    if (extraIntroLine !== -1) {
      addFinding(findings, file, extraIntroLine + 1, "intro-content", "Keep only the description and optional linked table of contents before the steps.");
    }
  }
  for (const verify of verifyHeadings) {
    if (!stepsHeading || verify.index < stepsHeading.index) {
      addFinding(findings, file, verify.line, "section-order", "Place `## Verify` after the steps section.");
    }
  }

  const knownH2s = new Set([...whyHeadings, stepsHeading, ...verifyHeadings].filter(Boolean));
  const conclusions = h2s.filter((heading) => !knownH2s.has(heading));
  for (const heading of conclusions) {
    if (heading.text === "Related") {
      addFinding(findings, file, heading.line, "related-section", "Remove `## Related` and place each link where it is used.");
    }
    if (!stepsHeading || heading.index < stepsHeading.index) {
      addFinding(findings, file, heading.line, "section-order", "Place only the optional table of contents before the steps; move this section after them.");
    }
  }
  if (conclusions.length > 1) {
    addFinding(findings, file, conclusions[1].line, "conclusion-count", "Keep at most one short conclusion section.");
  }
  if (conclusions[0] && h2s.at(-1) !== conclusions[0]) {
    addFinding(findings, file, conclusions[0].line, "conclusion-order", "Make the optional conclusion the final level 2 section.");
  }

  const steps = stepsHeading
    ? checkSteps(lines, headings, stepsHeading, file, findings, fencedLines)
    : [];

  if (title && stepsHeading) {
    const between = lines.slice(title.index + 1, stepsHeading.index);
    const hasToc = between.some((line) => /\]\(#[^)]+\)/u.test(line));
    if (hasToc && steps.length < 10) {
      addFinding(findings, file, title.line + 1, "toc-length", "Remove the table of contents from recipes with fewer than 10 steps.");
    }
  }

  for (const block of blocks.filter((candidate) => candidate.language === "json")) {
    try {
      JSON.parse(block.body);
    } catch (error) {
      addFinding(findings, file, block.start + 1, "json-syntax", `Fix the JSON example: ${error.message}`);
    }
  }

  const placeholderContent = masked;
  const anglePlaceholderContent = maskAngleSyntaxBlocks(placeholderContent, blocks);
  for (const match of findAnglePlaceholders(anglePlaceholderContent)) {
    addFinding(findings, file, lineNumberAt(anglePlaceholderContent, match.index), "placeholder", "Replace or remove this angle-bracket placeholder.");
  }
  for (const pattern of [
    { regex: /\{\{[^}\n]+\}\}/gu, rule: "placeholder", fix: "Replace or remove this template placeholder." },
    { regex: /\b(?:TODO|TBD|FIXME)\b/gu, rule: "todo", fix: "Resolve this unfinished marker before publishing the recipe." },
  ]) {
    for (const match of placeholderContent.matchAll(pattern.regex)) {
      addFinding(findings, file, lineNumberAt(placeholderContent, match.index), pattern.rule, pattern.fix);
    }
  }

  const anchors = headingAnchors(content);
  checkLinks(content, fencedLines, file, findings, anchors);

  return findings.sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
}

function collectMarkdown(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
    .map((entry) => path.join(directory, entry.name));
}

function displayPath(file) {
  const relative = path.relative(process.cwd(), file).replaceAll(path.sep, "/");
  return relative && !relative.startsWith("../") ? relative : file.replaceAll(path.sep, "/");
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function report(findings, fileCount, output = console.log, errorOutput = console.error) {
  if (findings.length === 0) {
    output(`PASS: ${fileCount} recipe(s) validated.`);
    return 0;
  }

  errorOutput("| File | Line | Rule | Fix |");
  errorOutput("| --- | ---: | --- | --- |");
  for (const finding of findings) {
    errorOutput(`| ${escapeCell(displayPath(finding.file))} | ${finding.line} | ${escapeCell(finding.rule)} | ${escapeCell(finding.fix)} |`);
  }
  errorOutput("");
  errorOutput(`FAIL: ${findings.length} finding(s) in ${fileCount} recipe(s).`);
  return 1;
}

function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true, all: false, paths: [] };
  }
  const unknown = argv.filter((argument) => argument.startsWith("-") && argument !== "--all");
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  return {
    help: false,
    all: argv.includes("--all"),
    paths: argv.filter((argument) => argument !== "--all"),
  };
}

function usage() {
  return [
    "Usage:",
    "  node validate-recipe.mjs <recipe.md> [more-recipes.md]",
    "  node validate-recipe.mjs --all",
  ].join("\n");
}

export function run(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    return 1;
  }

  if (parsed.help) {
    console.log(usage());
    return 0;
  }

  const candidates = parsed.paths.map((candidate) => path.resolve(process.cwd(), candidate));
  if (parsed.all) {
    candidates.push(...collectMarkdown(PROJECT_DIRECTORY), ...collectMarkdown(BUNDLED_DIRECTORY));
  }
  const files = [...new Set(candidates)].sort((left, right) => left.localeCompare(right));
  if (files.length === 0) {
    console.error(usage());
    console.error("FAIL: pass at least one recipe path or --all.");
    return 1;
  }

  const findings = files.flatMap((file) => validateRecipe(file));
  return report(findings, files.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}

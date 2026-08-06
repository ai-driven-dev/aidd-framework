#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { checkArtifact } = require("./backlog/artifact-rules.js");
const { checkBirth, checkTransition } = require("./backlog/change-rules.js");
const contract = require("./backlog/contract.js");
const { fileScope, sortDiagnostics } = require("./backlog/diagnostic.js");
const { checkGraph } = require("./backlog/graph-rules.js");
const { buildModel } = require("./backlog/model.js");
const { parseFrontmatter } = require("./backlog/markdown.js");
const { readBacklog, toPosix } = require("./backlog/read.js");

const BACKLOG_PATH = "aidd_docs/backlog/";
const PATH_KEYS = ["file_path", "filePath", "path"];
const PATCH_HEADER = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;

/** Reads the Markdown backlog and judges it. */
function inspectBacklog(input) {
  const { project, root, files, fileCount, artifacts, diagnostics } = readBacklog(input);
  const findings = [
    ...diagnostics,
    ...artifacts.flatMap(checkArtifact),
    ...checkGraph(artifacts, project),
  ];
  return {
    valid: findings.length === 0,
    project,
    root,
    files,
    ...buildModel(artifacts, project, fileCount),
    diagnostics: sortDiagnostics(findings),
  };
}

function writeTargets(value, found = []) {
  if (typeof value === "string") {
    const headers = [...value.matchAll(PATCH_HEADER)];
    for (const [index, match] of headers.entries()) {
      const end = headers[index + 1]?.index ?? value.length;
      found.push({ target: match[1].trim(), input: { patch: value.slice(match.index, end) } });
    }
    return found;
  }
  if (!value || typeof value !== "object") return found;
  const target = PATH_KEYS.map((key) => value[key]).find((item) => typeof item === "string");
  if (target) found.push({ target, input: value });
  for (const [key, item] of Object.entries(value)) {
    if (!PATH_KEYS.includes(key)) writeTargets(item, found);
  }
  return found;
}

function touchesBacklog(payload) {
  const mentionsPath = (value) => {
    if (typeof value === "string") return toPosix(value).includes(BACKLOG_PATH);
    if (!value || typeof value !== "object") return false;
    return Object.values(value).some(mentionsPath);
  };
  return mentionsPath(payload);
}

function patchedContent(patch, current) {
  if (typeof patch !== "string") return null;
  const lines = patch.split(/\r?\n/);
  const header = lines.findIndex((line) => /^\*\*\* (?:Add|Update) File: /.test(line));
  if (header < 0) return null;
  const adding = lines[header].startsWith("*** Add File: ");
  const end = lines.indexOf("*** End Patch", header + 1);
  const body = lines.slice(header + 1, end < 0 ? lines.length : end);

  if (adding) {
    if (body.some((line) => line && !line.startsWith("+"))) return null;
    return body.map((line) => line.slice(1)).join("\n");
  }
  if (current === null) return null;

  let result = current;
  const hunks = [];
  let hunk = null;
  for (const line of body) {
    if (line.startsWith("@@")) {
      if (hunk) hunks.push(hunk);
      hunk = [];
    } else if (hunk) {
      hunk.push(line);
    }
  }
  if (hunk) hunks.push(hunk);
  if (hunks.length === 0) return null;

  for (const linesOfHunk of hunks) {
    const before = [];
    const after = [];
    for (const line of linesOfHunk) {
      if (line.startsWith("-")) before.push(line.slice(1));
      else if (line.startsWith("+")) after.push(line.slice(1));
      else {
        const context = line.startsWith(" ") ? line.slice(1) : line;
        before.push(context);
        after.push(context);
      }
    }
    const oldText = before.join("\n");
    const index = result.indexOf(oldText);
    if (!oldText || index < 0 || result.indexOf(oldText, index + 1) >= 0) return null;
    result = `${result.slice(0, index)}${after.join("\n")}${result.slice(index + oldText.length)}`;
  }
  return result;
}

/** The content the tool is about to write, for a Write or an Edit. Null when it cannot be rebuilt. */
function proposedContent(input, current) {
  if (typeof input?.content === "string") return input.content;
  if (typeof input?.old_string === "string" && typeof input?.new_string === "string" && current !== null) {
    return current.includes(input.old_string) ? current.replace(input.old_string, input.new_string) : null;
  }
  if (typeof input?.oldString === "string" && typeof input?.newString === "string" && current !== null) {
    return current.includes(input.oldString) ? current.replace(input.oldString, input.newString) : null;
  }
  if (typeof input?.patch === "string") return patchedContent(input.patch, current);
  return null;
}

/** A patch never yields the whole file, but the status it sets is enough to judge the move. */
function patchedStatus(input) {
  const patch = typeof input?.patch === "string" ? input.patch : null;
  return patch?.match(/^\+status:\s*(\S+)/m)?.[1] ?? null;
}

/** Judges a write before it happens, which is the only moment a before and an after both exist. */
function inspectChange(payload) {
  return writeTargets(payload.tool_input ?? payload)
    .filter(({ target }) => toPosix(target).includes(BACKLOG_PATH))
    .flatMap(({ target, input }) => inspectTarget(target, input, payload.cwd));
}

function inspectTarget(target, input, cwd) {
  const absolute = path.isAbsolute(target) ? target : path.resolve(cwd || process.cwd(), target);
  const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;

  const patched = patchedStatus(input);
  if (patched !== null && current !== null) {
    const before = parseFrontmatter(current);
    return before.error ? [] : checkTransition(before.data, { ...before.data, status: patched }, toPosix(target));
  }

  const after = proposedContent(input, current);
  if (after === null) return [];

  const proposed = parseFrontmatter(after);
  if (proposed.error) return [];
  if (current === null) return checkBirth(proposed.data, toPosix(target));

  const before = parseFrontmatter(current);
  if (before.error) return [];

  return checkTransition(before.data, proposed.data, toPosix(target));
}

function printReport(result) {
  if (result.valid) {
    process.stdout.write(`Backlog valid: ${result.stats.files} artifacts\n`);
    return;
  }
  process.stderr.write(`Backlog invalid: ${result.diagnostics.length} findings\n`);
  for (const item of result.diagnostics.slice(0, 10)) {
    process.stderr.write(`${item.code} ${item.path}: ${item.message}\n`);
  }
}

async function readHookPayload() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

async function main(argv = process.argv.slice(2)) {
  const isPreHook = argv.includes("--pre-hook");
  const isHook = argv.includes("--hook");

  if (isPreHook) {
    const payload = await readHookPayload();
    if (!payload) return 0;
    const findings = inspectChange(payload);
    for (const item of findings) process.stderr.write(`${item.code} ${item.path}: ${item.message}\n`);
    return findings.length > 0 ? 2 : 0;
  }

  const asJson = argv.includes("--json");
  let input = argv.find((argument) => !argument.startsWith("--")) || process.cwd();

  if (isHook) {
    const payload = await readHookPayload();
    if (!payload || !touchesBacklog(payload)) return 0;
    if (typeof payload.cwd === "string") input = payload.cwd;
  }

  const inspected = inspectBacklog(input);
  const result = isHook ? fileScope(inspected) : inspected;

  if (asJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (!isHook || !result.valid) printReport(result);

  if (isHook) return result.valid ? 0 : 2;
  return result.valid ? 0 : 1;
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  ...contract,
  inspectBacklog,
  inspectChange,
  parseFrontmatter,
  patchedContent,
  proposedContent,
  touchesBacklog,
  writeTargets,
};

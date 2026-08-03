#!/usr/bin/env node

const fs = require("node:fs");

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
  const { project, root, fileCount, artifacts, diagnostics } = readBacklog(input);
  const findings = [
    ...diagnostics,
    ...artifacts.flatMap(checkArtifact),
    ...checkGraph(artifacts, project),
  ];
  return {
    valid: findings.length === 0,
    root,
    ...buildModel(artifacts, project, fileCount),
    diagnostics: sortDiagnostics(findings),
  };
}

function writtenPaths(value, found = []) {
  if (typeof value === "string") {
    for (const match of value.matchAll(PATCH_HEADER)) found.push(match[1].trim());
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const [key, item] of Object.entries(value)) {
    if (PATH_KEYS.includes(key) && typeof item === "string") found.push(item);
    else writtenPaths(item, found);
  }
  return found;
}

function touchesBacklog(payload) {
  return writtenPaths(payload).some((item) => toPosix(item).includes(BACKLOG_PATH));
}

/** The content the tool is about to write, for a Write or an Edit. Null when it cannot be rebuilt. */
function proposedContent(input, current) {
  if (typeof input?.content === "string") return input.content;
  if (typeof input?.old_string === "string" && typeof input?.new_string === "string" && current !== null) {
    return current.includes(input.old_string) ? current.replace(input.old_string, input.new_string) : null;
  }
  return null;
}

/** Judges a write before it happens, which is the only moment a before and an after both exist. */
function inspectChange(payload) {
  const [target] = writtenPaths(payload).filter((item) => toPosix(item).includes(BACKLOG_PATH));
  if (!target) return [];

  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  const after = proposedContent(payload.tool_input, current);
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

module.exports = { ...contract, inspectBacklog, inspectChange, parseFrontmatter, touchesBacklog };

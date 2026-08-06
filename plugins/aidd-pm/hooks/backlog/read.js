const fs = require("node:fs");
const path = require("node:path");

const { RELATIONS } = require("./contract.js");
const { diagnostic } = require("./diagnostic.js");
const { parseFrontmatter, titleFromBody } = require("./markdown.js");

const BACKLOG_DIR = path.join("aidd_docs", "backlog");

function toPosix(value) {
  return value.replaceAll("\\", "/");
}

/** Accepts the project root or the backlog directory itself. */
/**
 * The backlog belongs to the project, not to the directory a tool happens to run from.
 * A caller inside a subdirectory would otherwise read an empty graph and call it healthy.
 */
function locateBacklog(input = process.cwd()) {
  const absolute = path.resolve(input);
  if (toPosix(absolute).endsWith(toPosix(BACKLOG_DIR))) {
    return { project: path.dirname(path.dirname(absolute)), root: absolute };
  }
  let directory = absolute;
  while (true) {
    const root = path.join(directory, BACKLOG_DIR);
    if (fs.existsSync(root)) return { project: directory, root };
    const parent = path.dirname(directory);
    if (parent === directory) return { project: absolute, root: path.join(absolute, BACKLOG_DIR) };
    directory = parent;
  }
}

function markdownFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
    }
  };
  walk(root);
  return files.sort();
}

/** A reference to another artifact, always written from the project root, or null when external. */
function resolveLocalTarget(value, project) {
  if (typeof value !== "string" || !value.endsWith(".md")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  return toPosix(path.relative(project, path.resolve(project, value)));
}

/** Every value of a relation field, whether it holds one reference or a list. */
function relationValues(metadata, field) {
  if (!Object.hasOwn(metadata, field)) return [];
  return Array.isArray(metadata[field]) ? metadata[field] : [metadata[field]];
}

function resolveRelations(metadata, project) {
  const resolved = {};
  for (const field of RELATIONS) {
    if (!Object.hasOwn(metadata, field)) continue;
    resolved[field] = relationValues(metadata, field)
      .map((value) => resolveLocalTarget(value, project))
      .filter(Boolean);
  }
  return resolved;
}

function toArtifact(absolute, project, root, parsed) {
  const artifactPath = toPosix(path.relative(project, absolute));
  const [folder, filename, ...nested] = toPosix(path.relative(root, absolute)).split("/");
  return {
    path: artifactPath,
    folder,
    filename,
    nested: nested.length > 0,
    type: parsed.data.type,
    status: parsed.data.status,
    title: titleFromBody(parsed.body),
    metadata: parsed.data,
    body: parsed.body,
    relations: resolveRelations(parsed.data, project),
  };
}

/** Reads the Markdown backlog. The only place that touches the disk. */
function readBacklog(input) {
  const { project, root } = locateBacklog(input);
  const files = markdownFiles(root);
  const artifacts = [];
  const diagnostics = [];

  for (const absolute of files) {
    const parsed = parseFrontmatter(fs.readFileSync(absolute, "utf8"));
    if (parsed.error) {
      diagnostics.push(diagnostic("INVALID_FRONTMATTER", toPosix(path.relative(project, absolute)), parsed.error));
      continue;
    }
    artifacts.push(toArtifact(absolute, project, root, parsed));
  }

  return {
    project,
    root: toPosix(path.relative(project, root)) || ".",
    files: files.map((file) => toPosix(path.relative(project, file))),
    fileCount: files.length,
    artifacts,
    diagnostics,
  };
}

module.exports = { readBacklog, relationValues, resolveLocalTarget, toPosix };

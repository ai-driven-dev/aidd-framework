#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const STATUSES = {
  epic: new Set(["proposed", "ready", "in-progress", "done", "cancelled"]),
  story: new Set(["proposed", "ready", "in-progress", "done", "cancelled"]),
  task: new Set(["proposed", "ready", "in-progress", "done", "cancelled"]),
  spike: new Set(["open", "in-progress", "blocked", "resolved", "inconclusive", "cancelled"]),
  defect: new Set(["reported", "ready", "in-progress", "done", "cancelled"]),
};

const FOLDERS = { epic: "epics", story: "stories", task: "tasks", spike: "spikes", defect: "defects" };
const RELATIONS = ["goal", "parent", "parents", "depends_on", "related_to", "supersedes"];
const LIST_FIELDS = new Set(["parents", "depends_on", "related_to", "supersedes"]);
const TERMINAL = {
  epic: new Set(["done", "cancelled"]),
  story: new Set(["done", "cancelled"]),
  task: new Set(["done", "cancelled"]),
  spike: new Set(["resolved", "cancelled"]),
  defect: new Set(["done", "cancelled"]),
};
// Findings one file cannot prove. A single write is never a transaction, so the
// write-time hook stays silent on them and 08-verify judges the final graph.
const GRAPH_CODES = new Set([
  "ACTIVE_SUPERSEDED",
  "DUPLICATE_ORDER",
  "INVALID_GOAL_TYPE",
  "INVALID_PARENT_TYPE",
  "MIRRORED_RELATION",
  "MISSING_SOURCE",
  "MISSING_TARGET",
  "RELATION_CYCLE",
]);
const FORBIDDEN = {
  epic: new Set(["parent", "parents", "children", "blocked_by", "superseded_by", "work_kind"]),
  story: new Set(["goal", "parents", "children", "blocked_by", "superseded_by", "work_kind"]),
  task: new Set(["goal", "parents", "children", "blocked_by", "superseded_by"]),
  spike: new Set(["goal", "parent", "children", "blocked_by", "superseded_by", "order", "estimate", "work_kind"]),
  defect: new Set(["goal", "parent", "parents", "children", "blocked_by", "superseded_by", "work_kind"]),
};

function normalize(value) {
  return value.replaceAll("\\", "/");
}

function scalar(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function inlineList(value) {
  const inner = value.slice(1, -1).trim();
  return inner ? inner.split(",").map(scalar) : [];
}

function parseFrontmatter(content) {
  const lines = content.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") return { error: "missing YAML frontmatter" };

  const end = lines.indexOf("---", 1);
  if (end < 0) return { error: "unclosed YAML frontmatter" };

  const data = {};
  let listKey;

  for (let index = 1; index < end; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const item = line.match(/^\s{2}-\s*(.*)$/);
    if (item && listKey) {
      data[listKey].push(scalar(item[1]));
      continue;
    }

    const entry = line.match(/^([a-z][a-z0-9_]*):(?:\s*(.*))?$/);
    if (!entry) return { error: `unsupported YAML at line ${index + 1}` };

    const [, key, raw = ""] = entry;
    if (Object.hasOwn(data, key)) return { error: `duplicate field "${key}"` };
    if (!raw.trim()) {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = raw.trim().startsWith("[") && raw.trim().endsWith("]")
        ? inlineList(raw.trim())
        : scalar(raw);
      listKey = undefined;
    }
  }

  return { data, body: lines.slice(end + 1).join("\n") };
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

function locate(input = process.cwd()) {
  const absolute = path.resolve(input);
  const suffix = normalize(path.join("aidd_docs", "backlog"));
  if (normalize(absolute).endsWith(suffix)) {
    return { project: path.dirname(path.dirname(absolute)), root: absolute };
  }
  return { project: absolute, root: path.join(absolute, "aidd_docs", "backlog") };
}

function diagnostic(severity, code, artifactPath, message, field, target) {
  return {
    severity,
    code,
    scope: GRAPH_CODES.has(code) ? "graph" : "file",
    path: artifactPath,
    ...(field ? { field } : {}),
    ...(target ? { target } : {}),
    message,
  };
}

function presentSection(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = `${body}\n## __END__\n`.match(
    new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^## )`, "m"),
  );
  if (!match) return false;
  const value = match[1]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>\n]+>/g, "")
    .trim();
  return value.length > 0;
}

function titleFromBody(body) {
  const visible = withoutFencedCode(body)
    .split("\n")
    .filter((line) => !/^(?: {4}|\t)/.test(line))
    .join("\n");
  const heading = visible.match(/^#\s+(.+?)\s*$/m)?.[1];
  return heading?.replace(/^(?:Epic|Story|Task|Spike|Defect):\s*/i, "").trim() || "";
}

function withoutFencedCode(body) {
  return body.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
}

function hasEmbeddedFrontmatter(body) {
  return /(?:^|\n)---\s*\n(?:\s*\n)*(?:(?:[a-z][a-z0-9_]*:.*|  - .*)\n)+(?:\s*\n)*---(?:\n|$)/m.test(
    withoutFencedCode(body),
  );
}

// A copy of the frontmatter sits in the preamble, in a section heading, or in a
// metadata table. Inside a section, these words are ordinary prose.
function hasBodyMetadata(body) {
  const metadata = /^(?:#{1,6}\s+|[-*+]\s+|\|\s*)?(?:\*\*)?(?:type|status|source|goal|parent|parents|depends_on|related_to|supersedes|order|estimate|work_kind)(?:\*\*)?\s*:/i;
  let preamble = true;
  for (const line of withoutFencedCode(body).split("\n")) {
    if (/^(?: {4}|\t)/.test(line)) continue;
    const trimmed = line.trim();
    const section = trimmed.startsWith("## ");
    if ((preamble || section || trimmed.startsWith("|")) && metadata.test(trimmed)) return true;
    if (section) preamble = false;
  }
  return false;
}

function localTarget(value, artifact, project) {
  if (typeof value !== "string" || !value.endsWith(".md")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  const absolute = value.startsWith("./") || value.startsWith("../")
    ? path.resolve(path.dirname(artifact.absolute), value)
    : path.resolve(project, value);
  return normalize(path.relative(project, absolute));
}

function relationValues(metadata, field) {
  if (!Object.hasOwn(metadata, field)) return [];
  return Array.isArray(metadata[field]) ? metadata[field] : [metadata[field]];
}

function detectCycles(artifacts, field, diagnostics) {
  const graph = new Map();
  for (const artifact of artifacts) {
    const targets = artifact.localRelations[field] || [];
    graph.set(artifact.path, targets.filter((target) => artifacts.some((item) => item.path === target)));
  }

  const active = new Set();
  const done = new Set();
  const visit = (node, trail) => {
    if (active.has(node)) {
      const start = trail.indexOf(node);
      const cycle = [...trail.slice(start), node].join(" -> ");
      diagnostics.push(diagnostic("error", "RELATION_CYCLE", node, `${field} cycle: ${cycle}`, field));
      return;
    }
    if (done.has(node)) return;
    active.add(node);
    for (const next of graph.get(node) || []) visit(next, [...trail, node]);
    active.delete(node);
    done.add(node);
  };
  for (const node of graph.keys()) visit(node, []);
}

function inspectBacklog(input) {
  const { project, root } = locate(input);
  const diagnostics = [];
  const artifacts = [];
  const files = markdownFiles(root);

  for (const absolute of files) {
    const artifactPath = normalize(path.relative(project, absolute));
    const backlogPath = normalize(path.relative(root, absolute));
    const [folder, filename, ...rest] = backlogPath.split("/");
    const parsed = parseFrontmatter(fs.readFileSync(absolute, "utf8"));
    if (parsed.error) {
      diagnostics.push(diagnostic("error", "INVALID_FRONTMATTER", artifactPath, parsed.error));
      continue;
    }

    const metadata = parsed.data;
    const type = metadata.type;
    const status = metadata.status;
    const artifact = {
      absolute,
      path: artifactPath,
      type,
      status,
      title: titleFromBody(parsed.body),
      metadata,
      body: parsed.body,
      localRelations: {},
    };
    artifacts.push(artifact);

    const embeddedFrontmatter = hasEmbeddedFrontmatter(parsed.body);
    if (embeddedFrontmatter) {
      diagnostics.push(
        diagnostic("error", "EMBEDDED_FRONTMATTER", artifactPath, "artifact frontmatter cannot appear in the body"),
      );
    }
    if (!embeddedFrontmatter && hasBodyMetadata(parsed.body)) {
      diagnostics.push(
        diagnostic("error", "BODY_METADATA", artifactPath, "backlog metadata belongs in frontmatter"),
      );
    }

    if (typeof type !== "string" || !STATUSES[type]) {
      diagnostics.push(diagnostic("error", "INVALID_TYPE", artifactPath, `unknown type "${type || ""}"`, "type"));
      continue;
    }
    if (!artifact.title) {
      diagnostics.push(diagnostic("error", "MISSING_TITLE", artifactPath, "artifact needs one H1 title"));
    }
    const expectedFolder = FOLDERS[type];
    if (rest.length > 0 || !filename || folder !== expectedFolder) {
      diagnostics.push(
        diagnostic(
          "error",
          "INVALID_PATH",
          artifactPath,
          `${type} must be stored directly under aidd_docs/backlog/${expectedFolder}/`,
        ),
      );
    }
    if (typeof status !== "string" || !STATUSES[type].has(status)) {
      diagnostics.push(
        diagnostic("error", "INVALID_STATUS", artifactPath, `status "${status || ""}" is invalid for ${type}`, "status"),
      );
    }

    for (const field of FORBIDDEN[type]) {
      if (Object.hasOwn(metadata, field)) {
        diagnostics.push(
            diagnostic("error", "FIELD_OWNER", artifactPath, `${type} cannot own "${field}"`, field),
        );
      }
    }

    for (const field of RELATIONS) {
      if (!Object.hasOwn(metadata, field)) continue;
      const values = relationValues(metadata, field);
      const validShape = LIST_FIELDS.has(field)
        ? Array.isArray(metadata[field])
        : typeof metadata[field] === "string";
      if (!validShape || values.length === 0 || values.some((value) => typeof value !== "string" || !value.trim())) {
        const expectation = LIST_FIELDS.has(field)
          ? "must be a non-empty list of references"
          : "must be one non-empty reference";
        diagnostics.push(
          diagnostic("error", "INVALID_RELATION", artifactPath, `"${field}" ${expectation}`, field),
        );
        continue;
      }
      if (new Set(values).size !== values.length) {
        diagnostics.push(
          diagnostic("error", "DUPLICATE_RELATION", artifactPath, `"${field}" contains duplicates`, field),
        );
      }
      artifact.localRelations[field] = values
        .map((value) => localTarget(value, artifact, project))
        .filter(Boolean);
    }

    if (Object.hasOwn(metadata, "order")) {
      const order = Number(metadata.order);
      if (!Number.isInteger(order) || order < 1) {
        diagnostics.push(
          diagnostic("error", "INVALID_ORDER", artifactPath, "order must be a positive integer", "order"),
        );
      }
    }

    if (Object.hasOwn(metadata, "estimate")) {
      const estimate = metadata.estimate;
      if ((typeof estimate !== "string" && typeof estimate !== "number") || String(estimate).trim() === "") {
        diagnostics.push(
          diagnostic("error", "INVALID_ESTIMATE", artifactPath, "estimate cannot be empty", "estimate"),
        );
      }
    }
    if (
      Object.hasOwn(metadata, "work_kind") &&
      (typeof metadata.work_kind !== "string" || !["functional", "technical"].includes(metadata.work_kind))
    ) {
      diagnostics.push(
        diagnostic(
          "error",
          "INVALID_WORK_KIND",
          artifactPath,
          'work_kind must be "functional" or "technical"',
          "work_kind",
        ),
      );
    }
    if (
      Object.hasOwn(metadata, "source") &&
      (typeof metadata.source !== "string" || !metadata.source.trim())
    ) {
      diagnostics.push(
        diagnostic("error", "INVALID_SOURCE", artifactPath, "source cannot be empty", "source"),
      );
    } else if (typeof metadata.source === "string") {
      const source = localTarget(metadata.source, artifact, project);
      if (source && !fs.existsSync(path.resolve(project, source))) {
        diagnostics.push(
          diagnostic("error", "MISSING_SOURCE", artifactPath, `local source does not exist: ${source}`, "source", source),
        );
      }
    }
    if (
      type === "epic" &&
      typeof metadata.goal === "string" &&
      typeof metadata.source === "string" &&
      metadata.goal === metadata.source
    ) {
      diagnostics.push(
        diagnostic(
          "error",
          "DUPLICATE_SEMANTIC_RELATION",
          artifactPath,
          "goal and source cannot hold the same reference",
          "goal",
          metadata.goal,
        ),
      );
    }

    if (type === "epic" && status === "done" && !presentSection(parsed.body, "Success Evidence")) {
      diagnostics.push(
        diagnostic("error", "MISSING_SUCCESS_EVIDENCE", artifactPath, "done Epic needs Success Evidence"),
      );
    }
    if (type === "story" && status === "done" && !presentSection(parsed.body, "Acceptance")) {
      diagnostics.push(
        diagnostic("error", "MISSING_ACCEPTANCE", artifactPath, "done Story needs Acceptance"),
      );
    }
    if (type === "task" && ["ready", "in-progress", "done"].includes(status)) {
      const missing = ["Outcome", "Scope", "Done When"]
        .filter((heading) => !presentSection(parsed.body, heading));
      if (missing.length > 0) {
        diagnostics.push(
          diagnostic("error", "INCOMPLETE_TASK", artifactPath, `active Task needs ${missing.join(", ")}`),
        );
      }
    }
    if (type === "task" && status === "done" && !presentSection(parsed.body, "Completion Evidence")) {
      diagnostics.push(
        diagnostic("error", "MISSING_TASK_EVIDENCE", artifactPath, "done Task needs Completion Evidence"),
      );
    }
    if (type === "defect" && ["ready", "in-progress", "done"].includes(status)) {
      const missing = ["Expected", "Actual", "Impact", "Evidence"]
        .filter((heading) => !presentSection(parsed.body, heading));
      if (missing.length > 0) {
        diagnostics.push(
          diagnostic(
            "error",
            "INCOMPLETE_DEFECT",
            artifactPath,
            `active Defect needs ${missing.join(", ")}`,
          ),
        );
      }
    }
    if (type === "defect" && status === "done" && !presentSection(parsed.body, "Verification")) {
      diagnostics.push(
        diagnostic("error", "MISSING_DEFECT_VERIFICATION", artifactPath, "done Defect needs Verification"),
      );
    }
    if (
      type === "spike" &&
      ["resolved", "inconclusive", "cancelled"].includes(status) &&
      (!presentSection(parsed.body, "Outcome") || !presentSection(parsed.body, "Follow-up"))
    ) {
      diagnostics.push(
        diagnostic("error", "MISSING_SPIKE_OUTCOME", artifactPath, "terminal Spike needs Outcome and Follow-up"),
      );
    }
  }

  const byPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  for (const artifact of artifacts) {
    for (const [field, targets] of Object.entries(artifact.localRelations)) {
      for (const target of targets) {
        const linked = byPath.get(target);
        if (!linked) {
          if (field === "goal" && fs.existsSync(path.resolve(project, target))) continue;
          diagnostics.push(
            diagnostic("error", "MISSING_TARGET", artifact.path, `local target does not exist: ${target}`, field, target),
          );
          continue;
        }
        if (artifact.type === "story" && field === "parent" && linked.type !== "epic") {
          diagnostics.push(
            diagnostic("error", "INVALID_PARENT_TYPE", artifact.path, "Story parent must be an Epic", field, target),
          );
        }
        if (
          artifact.type === "task" &&
          field === "parent" &&
          !["epic", "story", "defect"].includes(linked.type)
        ) {
          diagnostics.push(
            diagnostic(
              "error",
              "INVALID_PARENT_TYPE",
              artifact.path,
              "Task parent must be an Epic, Story, or Defect",
              field,
              target,
            ),
          );
        }
        if (
          artifact.type === "spike" &&
          field === "parents" &&
          !["epic", "story", "task"].includes(linked.type)
        ) {
          diagnostics.push(
            diagnostic(
              "error",
              "INVALID_PARENT_TYPE",
              artifact.path,
              "Spike parents must be Epics, Stories, or Tasks",
              field,
              target,
            ),
          );
        }
        if (artifact.type === "epic" && field === "goal") {
          diagnostics.push(
            diagnostic(
              "error",
              "INVALID_GOAL_TYPE",
              artifact.path,
              "Epic goal must reference a product goal outside the backlog",
              field,
              target,
            ),
          );
        }
        if (field === "supersedes" && !TERMINAL[linked.type]?.has(linked.status)) {
          diagnostics.push(
            diagnostic(
              "error",
              "ACTIVE_SUPERSEDED",
              artifact.path,
              `superseded artifact is not terminal: ${target}`,
              field,
              target,
            ),
          );
        }
      }
    }
  }

  for (const artifact of artifacts) {
    for (const target of artifact.localRelations.related_to || []) {
      if (artifact.path.localeCompare(target) >= 0) continue;
      const linked = byPath.get(target);
      if (linked?.localRelations.related_to?.includes(artifact.path)) {
        diagnostics.push(
          diagnostic(
            "error",
            "MIRRORED_RELATION",
            artifact.path,
            `related_to is stored on both artifacts; keep it here and remove it from ${target}`,
            "related_to",
            target,
          ),
        );
      }
    }
  }

  detectCycles(artifacts, "depends_on", diagnostics);
  detectCycles(artifacts, "supersedes", diagnostics);

  const orders = new Map();
  for (const artifact of artifacts) {
    if (!["epic", "story", "task", "defect"].includes(artifact.type)) continue;
    if (!Object.hasOwn(artifact.metadata, "order")) continue;
    // Epics and Defects have no parent: they are ordered against their own kind.
    const owner = ["story", "task"].includes(artifact.type)
      ? artifact.localRelations.parent?.[0] || artifact.metadata.parent || `standalone-${artifact.type}`
      : artifact.type;
    const key = `${artifact.type}\0${owner}\0${artifact.metadata.order}`;
    const existing = orders.get(key);
    if (existing) {
      diagnostics.push(
        diagnostic(
          "error",
          "DUPLICATE_ORDER",
          artifact.path,
          `order ${artifact.metadata.order} is also used by ${existing}`,
          "order",
          existing,
        ),
      );
    } else {
      orders.set(key, artifact.path);
    }
  }

  diagnostics.sort((a, b) =>
    a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || (a.field || "").localeCompare(b.field || ""),
  );
  const counts = { epic: 0, story: 0, task: 0, spike: 0, defect: 0 };
  for (const artifact of artifacts) {
    if (Object.hasOwn(counts, artifact.type)) counts[artifact.type] += 1;
  }

  const readArtifacts = artifacts.map((artifact) => {
    const relations = {};
    for (const field of RELATIONS) {
      if (Object.hasOwn(artifact.metadata, field)) relations[field] = relationValues(artifact.metadata, field);
    }
    return {
      id: artifact.path,
      path: artifact.path,
      title: artifact.title,
      type: artifact.type,
      status: artifact.status,
      ...(Object.hasOwn(artifact.metadata, "source") ? { source: artifact.metadata.source } : {}),
      ...(Object.hasOwn(artifact.metadata, "order") ? { order: artifact.metadata.order } : {}),
      ...(Object.hasOwn(artifact.metadata, "estimate") ? { estimate: artifact.metadata.estimate } : {}),
      ...(Object.hasOwn(artifact.metadata, "work_kind") ? { work_kind: artifact.metadata.work_kind } : {}),
      ...(Object.keys(relations).length > 0 ? { relations } : {}),
    };
  });
  const edges = [];
  for (const artifact of artifacts) {
    const fields = Object.hasOwn(artifact.metadata, "source") ? ["source", ...RELATIONS] : RELATIONS;
    for (const field of fields) {
      for (const value of relationValues(artifact.metadata, field)) {
        const local = localTarget(value, artifact, project);
        edges.push({
          from: artifact.path,
          to: local || value,
          relation: field,
          local: Boolean(local),
        });
      }
    }
  }

  return {
    valid: !diagnostics.some((item) => item.severity === "error"),
    root: normalize(path.relative(project, root)) || ".",
    artifacts: readArtifacts,
    edges,
    diagnostics,
    stats: { files: files.length, ...counts },
  };
}

function extractPaths(value, found = []) {
  if (typeof value === "string") {
    const pattern = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;
    for (const match of value.matchAll(pattern)) found.push(match[1].trim());
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const [key, item] of Object.entries(value)) {
    if (["file_path", "filePath", "path"].includes(key) && typeof item === "string") found.push(item);
    else extractPaths(item, found);
  }
  return found;
}

function touchesBacklog(payload) {
  return extractPaths(payload).some((item) => normalize(item).includes("aidd_docs/backlog/"));
}

function fileScope(result) {
  const diagnostics = result.diagnostics.filter((item) => item.scope === "file");
  return { ...result, valid: !diagnostics.some((item) => item.severity === "error"), diagnostics };
}

function printText(result) {
  if (result.valid) {
    process.stdout.write(`Backlog valid: ${result.stats.files} artifacts\n`);
    return;
  }
  process.stderr.write(`Backlog invalid: ${result.diagnostics.length} findings\n`);
  for (const item of result.diagnostics.slice(0, 10)) {
    process.stderr.write(`${item.code} ${item.path}: ${item.message}\n`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const hook = argv.includes("--hook");
  const json = argv.includes("--json");
  let input = argv.find((argument) => !argument.startsWith("--")) || process.cwd();

  if (hook) {
    let payload;
    try {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return 0;
    }
    if (!touchesBacklog(payload)) return 0;
    if (typeof payload.cwd === "string") input = payload.cwd;
  }

  const result = hook ? fileScope(inspectBacklog(input)) : inspectBacklog(input);
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (!hook || !result.valid) printText(result);
  if (hook && !result.valid) return 2;
  return result.valid ? 0 : 1;
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  FOLDERS,
  FORBIDDEN,
  GRAPH_CODES,
  STATUSES,
  inspectBacklog,
  parseFrontmatter,
  touchesBacklog,
};

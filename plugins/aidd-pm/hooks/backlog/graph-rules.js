// Everything that needs more than one artifact, or the project around it.

const fs = require("node:fs");
const path = require("node:path");

const { PARENT_RULES, TERMINAL } = require("./contract.js");
const { diagnostic } = require("./diagnostic.js");
const { resolveLocalTarget } = require("./read.js");

const ORDERED_TYPES = ["epic", "story", "task", "defect"];

function checkLinkTargets(artifacts, project, diagnostics) {
  const byPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));

  for (const artifact of artifacts) {
    for (const [field, targets] of Object.entries(artifact.relations)) {
      for (const target of targets) {
        const report = (code, message) =>
          diagnostics.push(diagnostic(code, artifact.path, message, field, target));
        const linked = byPath.get(target);

        if (!linked) {
          const goalOutsideBacklog = field === "goal" && fs.existsSync(path.resolve(project, target));
          if (!goalOutsideBacklog) report("MISSING_TARGET", `local target does not exist: ${target}`);
          continue;
        }

        const parentRule = PARENT_RULES[artifact.type];
        if (parentRule && field === parentRule.field && !parentRule.allowed.includes(linked.type)) {
          report("INVALID_PARENT_TYPE", parentRule.message);
        }
        if (artifact.type === "epic" && field === "goal") {
          report("INVALID_GOAL_TYPE", "Epic goal must reference a product goal outside the backlog");
        }
        if (field === "supersedes" && !TERMINAL[linked.type]?.has(linked.status)) {
          report("ACTIVE_SUPERSEDED", `superseded artifact is not terminal: ${target}`);
        }
        if (["parent", "parents"].includes(field) && TERMINAL[linked.type]?.has(linked.status) &&
          !TERMINAL[artifact.type]?.has(artifact.status)) {
          report("LIVE_CHILD", `live child belongs to terminal parent: ${target}`);
        }
      }
    }
  }
}

/** `source` is the one origin that may point outside the backlog, so it is checked on disk. */
function checkSourceExists(artifacts, project, diagnostics) {
  for (const artifact of artifacts) {
    const { source } = artifact.metadata;
    if (typeof source !== "string") continue;
    const local = resolveLocalTarget(source, project);
    if (local && !fs.existsSync(path.resolve(project, local))) {
      diagnostics.push(
        diagnostic("MISSING_SOURCE", artifact.path, `local source does not exist: ${local}`, "source", local),
      );
    }
  }
}

/** `related_to` belongs to the artifact whose path sorts first; the other side carries nothing. */
function checkMirroredRelations(artifacts, diagnostics) {
  const byPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  for (const artifact of artifacts) {
    for (const target of artifact.relations.related_to || []) {
      if (artifact.path >= target) continue;
      if (byPath.get(target)?.relations.related_to?.includes(artifact.path)) {
        diagnostics.push(
          diagnostic(
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
}

function checkCycles(artifacts, field, diagnostics) {
  const known = new Set(artifacts.map((artifact) => artifact.path));
  const edges = new Map(
    artifacts.map((artifact) => [artifact.path, (artifact.relations[field] || []).filter((t) => known.has(t))]),
  );

  const visiting = new Set();
  const settled = new Set();
  const visit = (node, trail) => {
    if (visiting.has(node)) {
      const cycle = [...trail.slice(trail.indexOf(node)), node].join(" -> ");
      diagnostics.push(diagnostic("RELATION_CYCLE", node, `${field} cycle: ${cycle}`, field));
      return;
    }
    if (settled.has(node)) return;
    visiting.add(node);
    for (const next of edges.get(node) || []) visit(next, [...trail, node]);
    visiting.delete(node);
    settled.add(node);
  };
  for (const node of edges.keys()) visit(node, []);
}

/** Stories and Tasks are ordered within their parent; Epics and Defects against their own kind. */
function orderSpace(artifact) {
  if (!["story", "task"].includes(artifact.type)) return artifact.type;
  return artifact.relations.parent?.[0] || artifact.metadata.parent || `standalone-${artifact.type}`;
}

function checkOrderCollisions(artifacts, diagnostics) {
  const taken = new Map();
  for (const artifact of artifacts) {
    if (!ORDERED_TYPES.includes(artifact.type) || !Object.hasOwn(artifact.metadata, "order")) continue;
    const key = `${artifact.type}\0${orderSpace(artifact)}\0${Number(artifact.metadata.order)}`;
    const holder = taken.get(key);
    if (holder) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_ORDER",
          artifact.path,
          `order ${artifact.metadata.order} is also used by ${holder}`,
          "order",
          holder,
        ),
      );
    } else {
      taken.set(key, artifact.path);
    }
  }
}

/** Every finding that needs the whole set. */
function checkGraph(artifacts, project) {
  const diagnostics = [];
  checkLinkTargets(artifacts, project, diagnostics);
  checkSourceExists(artifacts, project, diagnostics);
  checkMirroredRelations(artifacts, diagnostics);
  checkCycles(artifacts, "depends_on", diagnostics);
  checkCycles(artifacts, "supersedes", diagnostics);
  checkOrderCollisions(artifacts, diagnostics);
  return diagnostics;
}

module.exports = { checkGraph };

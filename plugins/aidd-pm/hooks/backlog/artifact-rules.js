// Everything one artifact proves on its own. No filesystem, no siblings.

const {
  FOLDERS,
  FORBIDDEN,
  LIST_FIELDS,
  METADATA_FIELDS,
  RELATIONS,
  REQUIRED_SECTIONS,
  STATUSES,
} = require("./contract.js");
const { diagnostic } = require("./diagnostic.js");
const { hasCopiedMetadata, hasEmbeddedFrontmatter, hasPlaceholder, hasSection } = require("./markdown.js");

function checkBody({ path: artifactPath, body }, report) {
  if (hasEmbeddedFrontmatter(body)) {
    return report("EMBEDDED_FRONTMATTER", "artifact frontmatter cannot appear in the body");
  }
  if (hasCopiedMetadata(body, METADATA_FIELDS)) {
    report("BODY_METADATA", "backlog metadata belongs in frontmatter");
  }
  if (hasPlaceholder(body)) {
    report("PLACEHOLDER", "a template placeholder was left in the body");
  }
}

function checkPlacement({ type, folder, filename, nested }, report) {
  if (nested || !filename || folder !== FOLDERS[type]) {
    report("INVALID_PATH", `${type} must be stored directly under aidd_docs/backlog/${FOLDERS[type]}/`);
  }
}

function checkOwnedFields({ type, metadata }, report) {
  for (const field of FORBIDDEN[type]) {
    if (Object.hasOwn(metadata, field)) report("FIELD_OWNER", `${type} cannot own "${field}"`, field);
  }
}

function checkRelationShapes({ metadata }, report) {
  for (const field of RELATIONS) {
    if (!Object.hasOwn(metadata, field)) continue;
    const values = Array.isArray(metadata[field]) ? metadata[field] : [metadata[field]];
    // A field that may hold several accepts one written plainly; a single-valued field never accepts a list.
    const shapeHolds = LIST_FIELDS.has(field) || typeof metadata[field] === "string";
    const filled = values.length > 0 && values.every((value) => typeof value === "string" && value.trim());
    if (!shapeHolds || !filled) {
      const expectation = LIST_FIELDS.has(field)
        ? "must hold one reference or a non-empty list"
        : "must be one non-empty reference";
      report("INVALID_RELATION", `"${field}" ${expectation}`, field);
      continue;
    }
    if (new Set(values).size !== values.length) {
      report("DUPLICATE_RELATION", `"${field}" contains duplicates`, field);
    }
  }
}

function checkPlanningFields({ metadata }, report) {
  if (Object.hasOwn(metadata, "order")) {
    const order = Number(metadata.order);
    if (!Number.isInteger(order) || order < 1) {
      report("INVALID_ORDER", "order must be a positive integer", "order");
    }
  }
  if (Object.hasOwn(metadata, "estimate")) {
    const estimate = metadata.estimate;
    const usable = (typeof estimate === "string" || typeof estimate === "number") && String(estimate).trim();
    if (!usable) report("INVALID_ESTIMATE", "estimate cannot be empty", "estimate");
  }
  if (Object.hasOwn(metadata, "work_kind") && !["functional", "technical"].includes(metadata.work_kind)) {
    report("INVALID_WORK_KIND", 'work_kind must be "functional" or "technical"', "work_kind");
  }
}

function checkOrigin({ type, metadata }, report) {
  if (Object.hasOwn(metadata, "source") && (typeof metadata.source !== "string" || !metadata.source.trim())) {
    report("INVALID_SOURCE", "source cannot be empty", "source");
  }
  if (type === "epic" && metadata.goal && metadata.goal === metadata.source) {
    report("DUPLICATE_SEMANTIC_RELATION", "goal and source cannot hold the same reference", "goal", metadata.goal);
  }
}

function checkEarnedSections({ type, status, body }, report) {
  for (const rule of REQUIRED_SECTIONS) {
    if (rule.type !== type || !rule.statuses.includes(status)) continue;
    const absent = rule.sections.filter((heading) => !body.includes(`## ${heading}`));
    const empty = rule.sections.filter((heading) => !absent.includes(heading) && !hasSection(body, heading));
    const missing = [
      ...absent.map((heading) => heading),
      ...empty.map((heading) => `${heading} (empty)`),
    ];
    if (missing.length > 0) report(rule.code, `${rule.label} needs ${missing.join(", ")}`);
  }
}

/** Every finding a single artifact can prove about itself. */
function checkArtifact(artifact) {
  const diagnostics = [];
  const report = (code, message, field, target) =>
    diagnostics.push(diagnostic(code, artifact.path, message, field, target));

  checkBody(artifact, report);

  if (typeof artifact.type !== "string" || !STATUSES[artifact.type]) {
    report("INVALID_TYPE", `unknown type "${artifact.type || ""}"`, "type");
    return diagnostics;
  }
  if (!artifact.title) report("MISSING_TITLE", "artifact needs one H1 title");
  if (!STATUSES[artifact.type].has(artifact.status)) {
    report("INVALID_STATUS", `status "${artifact.status || ""}" is invalid for ${artifact.type}`, "status");
  }

  checkPlacement(artifact, report);
  checkOwnedFields(artifact, report);
  checkRelationShapes(artifact, report);
  checkPlanningFields(artifact, report);
  checkOrigin(artifact, report);
  checkEarnedSections(artifact, report);

  return diagnostics;
}

module.exports = { checkArtifact };

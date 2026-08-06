const { FORBIDDEN, PARENT_RULES, RELATIONS, STATUSES, TERMINAL, TRANSITIONS } = require("./contract.js");

const GRAPH_RELATIONS = new Set(RELATIONS);
const ARTIFACT_FIELDS = new Set(["key", "id", "type", "status", "relations", "order", "estimate", "fields", "verified"]);
const TRANSACTION_FIELDS = new Set(["version", "transaction", "phase", "before", "proposed", "actual"]);

function finding(code, key, message, field, target) {
  return {
    severity: "error",
    code,
    scope: "transaction",
    path: key || "transaction",
    ...(field ? { field } : {}),
    ...(target ? { target } : {}),
    message,
  };
}

function values(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** A value that does not apply is absent. Writers reach for null, so it reads as the same thing. */
function withoutNulls(raw) {
  const value = {};
  for (const [field, item] of Object.entries(raw)) {
    if (item === null) continue;
    value[field] = field === "relations" && item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).filter(([, target]) => target !== null))
      : item;
  }
  return value;
}

function normalizeArtifact(rawArtifact, label, diagnostics) {
  if (!rawArtifact || typeof rawArtifact !== "object" || Array.isArray(rawArtifact)) {
    diagnostics.push(finding("INVALID_ARTIFACT", label, "artifact must be an object"));
    return null;
  }
  const raw = withoutNulls(rawArtifact);
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  if (!key) {
    diagnostics.push(finding("MISSING_KEY", label, "artifact key is required"));
    return null;
  }
  for (const field of Object.keys(raw)) {
    if (!ARTIFACT_FIELDS.has(field)) diagnostics.push(finding("UNKNOWN_FIELD", key, `unsupported artifact field: ${field}`, field));
  }
  if (Object.hasOwn(raw, "id") && (typeof raw.id !== "string" || !raw.id.trim())) {
    diagnostics.push(finding("INVALID_IDENTITY", key, "id must be one non-empty support identity", "id"));
  }
  if (Object.hasOwn(raw, "fields") && (!raw.fields || typeof raw.fields !== "object" || Array.isArray(raw.fields))) {
    diagnostics.push(finding("INVALID_FIELDS", key, "fields must be an object", "fields"));
  }
  if (Object.hasOwn(raw, "verified") && typeof raw.verified !== "boolean") {
    diagnostics.push(finding("INVALID_VERIFICATION", key, "verified must be true or false", "verified"));
  }
  const relations = {};
  if (raw.relations !== undefined && (!raw.relations || typeof raw.relations !== "object" || Array.isArray(raw.relations))) {
    diagnostics.push(finding("INVALID_RELATIONS", key, "relations must be an object"));
  } else {
    for (const [field, rawTargets] of Object.entries(raw.relations || {})) {
      if (!GRAPH_RELATIONS.has(field)) {
        diagnostics.push(finding("UNKNOWN_RELATION", key, `unsupported relation: ${field}`, field));
        continue;
      }
      const rawValues = values(rawTargets);
      const targets = rawValues.filter((target) => typeof target === "string").map((target) => target.trim()).filter(Boolean);
      if (targets.length !== rawValues.length || new Set(targets).size !== targets.length) {
        diagnostics.push(finding("INVALID_RELATION", key, `${field} contains an empty or duplicate target`, field));
      }
      if (targets.length > 0) relations[field] = [...targets].sort();
    }
  }
  return {
    key,
    ...(typeof raw.id === "string" && raw.id.trim() ? { id: raw.id.trim() } : {}),
    type: raw.type,
    status: raw.status,
    ...(Object.keys(relations).length > 0 ? { relations } : {}),
    ...(raw.order !== undefined ? { order: Number(raw.order) } : {}),
    ...(raw.estimate !== undefined ? { estimate: raw.estimate } : {}),
    ...(raw.fields && typeof raw.fields === "object" && !Array.isArray(raw.fields) ? { fields: raw.fields } : {}),
    verified: raw.verified === true,
  };
}

/** A Markdown artifact answers to its path with or without the support name, so both spell one identity. */
function supportIdentity(id) {
  return id.startsWith("markdown:") ? id.slice("markdown:".length) : id;
}

function normalizeSnapshot(raw, name, diagnostics) {
  if (!Array.isArray(raw)) {
    diagnostics.push(finding("INVALID_SNAPSHOT", name, `${name} must be an artifact array`));
    return { artifacts: [], byKey: new Map() };
  }
  const artifacts = raw
    .map((artifact, index) => normalizeArtifact(artifact, `${name}[${index}]`, diagnostics))
    .filter(Boolean);
  const byKey = new Map();
  const byId = new Map();
  for (const artifact of artifacts) {
    if (byKey.has(artifact.key)) diagnostics.push(finding("DUPLICATE_KEY", artifact.key, "artifact key is duplicated"));
    else byKey.set(artifact.key, artifact);
    if (!artifact.id) continue;
    const identity = supportIdentity(artifact.id);
    if (byId.has(identity)) diagnostics.push(finding("DUPLICATE_IDENTITY", artifact.key, `support identity is also used by ${byId.get(identity)}`, "id"));
    else byId.set(identity, artifact.key);
  }
  artifacts.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  return { artifacts, byKey };
}

function isTerminal(artifact) {
  return TERMINAL[artifact?.type]?.has(artifact.status) ?? false;
}

function checkSnapshot(snapshot) {
  const diagnostics = [];
  const ordered = new Map();

  for (const artifact of snapshot.artifacts) {
    if (!STATUSES[artifact.type]) {
      diagnostics.push(finding("UNKNOWN_TYPE", artifact.key, `unsupported artifact type: ${artifact.type}`));
      continue;
    }
    if (!STATUSES[artifact.type].has(artifact.status)) {
      diagnostics.push(finding("UNKNOWN_STATUS", artifact.key, `unsupported ${artifact.type} status: ${artifact.status}`, "status"));
    }
    if (artifact.order !== undefined) {
      if (!Number.isInteger(artifact.order) || artifact.order < 1) {
        diagnostics.push(finding("INVALID_ORDER", artifact.key, "order must be a positive integer", "order"));
      } else {
        const parent = artifact.relations?.parent?.[0] || `standalone-${artifact.type}`;
        const space = `${artifact.type}\0${parent}\0${artifact.order}`;
        const holder = ordered.get(space);
        if (holder) diagnostics.push(finding("DUPLICATE_ORDER", artifact.key, `order ${artifact.order} is also used by ${holder}`, "order", holder));
        else ordered.set(space, artifact.key);
      }
    }

    for (const [field, targets] of Object.entries(artifact.relations || {})) {
      if (FORBIDDEN[artifact.type]?.has(field)) {
        diagnostics.push(finding("INVALID_RELATION_OWNER", artifact.key, `${artifact.type} cannot own ${field}`, field));
      }
      if (field === "parent" && targets.length !== 1) {
        diagnostics.push(finding("INVALID_RELATION", artifact.key, "parent must hold one target", field));
      }
      for (const target of targets) {
        if (field === "goal") continue;
        const linked = snapshot.byKey.get(target);
        if (!linked) {
          diagnostics.push(finding("INCOMPLETE_SCOPE", artifact.key, `relation target is absent from the transaction: ${target}`, field, target));
          continue;
        }
        const parentRule = PARENT_RULES[artifact.type];
        if (parentRule?.field === field && !parentRule.allowed.includes(linked.type)) {
          diagnostics.push(finding("INVALID_PARENT_TYPE", artifact.key, parentRule.message, field, target));
        }
        if (field === "supersedes" && !isTerminal(linked)) {
          diagnostics.push(finding("ACTIVE_SUPERSEDED", artifact.key, `superseded artifact is not terminal: ${target}`, field, target));
        }
      }
    }
  }

  for (const artifact of snapshot.artifacts) {
    for (const target of artifact.relations?.related_to || []) {
      if (snapshot.byKey.get(target)?.relations?.related_to?.includes(artifact.key)) {
        diagnostics.push(finding("MIRRORED_RELATION", artifact.key, `related_to is stored on both artifacts: ${target}`, "related_to", target));
      }
    }
    for (const parent of [...(artifact.relations?.parent || []), ...(artifact.relations?.parents || [])]) {
      const linked = snapshot.byKey.get(parent);
      if (linked && isTerminal(linked) && !isTerminal(artifact)) {
        diagnostics.push(finding("LIVE_CHILD", artifact.key, `live child belongs to terminal parent: ${parent}`, "parent", parent));
      }
    }
  }

  for (const field of ["depends_on", "supersedes"]) {
    const visiting = new Set();
    const settled = new Set();
    const visit = (key, trail) => {
      if (visiting.has(key)) {
        diagnostics.push(finding("RELATION_CYCLE", key, `${field} cycle: ${[...trail.slice(trail.indexOf(key)), key].join(" -> ")}`, field));
        return;
      }
      if (settled.has(key)) return;
      visiting.add(key);
      for (const next of snapshot.byKey.get(key)?.relations?.[field] || []) visit(next, [...trail, key]);
      visiting.delete(key);
      settled.add(key);
    };
    for (const key of snapshot.byKey.keys()) visit(key, []);
  }

  return diagnostics;
}

function semantic(artifact) {
  const { id, verified, ...value } = artifact;
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function changed(before, after) {
  return !before || stable(semantic(before)) !== stable(semantic(after));
}

function introduced(before, after) {
  const known = new Set(before.map((item) => stable([item.code, item.path, item.field || "", item.target || "", item.message])));
  return after.filter((item) => !known.has(stable([item.code, item.path, item.field || "", item.target || "", item.message])));
}

function checkProposal(before, proposed) {
  const diagnostics = introduced(checkSnapshot(before), checkSnapshot(proposed));
  for (const [key, prior] of before.byKey) {
    if (!prior.id) diagnostics.push(finding("MISSING_IDENTITY", key, "a prior artifact needs its support identity", "id"));
    const next = proposed.byKey.get(key);
    if (!next) {
      diagnostics.push(finding("ARTIFACT_DELETED", key, "artifacts are concluded or cancelled, not deleted"));
      continue;
    }
    if (prior.type !== next.type) diagnostics.push(finding("TYPE_CHANGED", key, "an artifact cannot change type", "type"));
    if (prior.id && next.id && supportIdentity(prior.id) !== supportIdentity(next.id)) {
      diagnostics.push(finding("IDENTITY_CHANGED", key, "an existing support identity cannot change", "id"));
    }
    if (prior.status !== next.status && !TRANSITIONS[prior.type]?.[prior.status]?.includes(next.status)) {
      diagnostics.push(finding("ILLEGAL_TRANSITION", key, `${prior.type} cannot move from ${prior.status} to ${next.status}`, "status"));
    }
    if (changed(prior, next) && !next.verified) diagnostics.push(finding("UNVERIFIED_ARTIFACT", key, "the artifact owner did not verify the proposed state"));
  }
  for (const [key, artifact] of proposed.byKey) {
    if (before.byKey.has(key)) continue;
    if (isTerminal(artifact)) diagnostics.push(finding("TERMINAL_AT_CREATION", key, `${artifact.type} cannot be created at ${artifact.status}`, "status"));
    if (!artifact.verified) diagnostics.push(finding("UNVERIFIED_ARTIFACT", key, "the artifact owner did not verify the proposed state"));
  }
  return diagnostics;
}

function checkActual(before, proposed, actual) {
  const diagnostics = introduced(checkSnapshot(proposed), checkSnapshot(actual));
  for (const [key, expected] of proposed.byKey) {
    const observed = actual.byKey.get(key);
    if (!observed) {
      diagnostics.push(finding("MISSING_ACTUAL", key, "the written artifact was not read back"));
      continue;
    }
    if (stable(semantic(expected)) !== stable(semantic(observed))) {
      diagnostics.push(finding("ACTUAL_MISMATCH", key, "read-back state differs from the validated proposal"));
    }
    if (!observed.id) diagnostics.push(finding("MISSING_IDENTITY", key, "a read-back artifact needs its support identity", "id"));
    const prior = before.byKey.get(key);
    if (prior?.id && observed.id && supportIdentity(observed.id) !== supportIdentity(prior.id)) {
      diagnostics.push(finding("IDENTITY_CHANGED", key, "the support changed an existing identity", "id"));
    }
    if (!prior && expected.id && observed.id && supportIdentity(observed.id) !== supportIdentity(expected.id)) {
      diagnostics.push(finding("IDENTITY_CHANGED", key, "the support changed a reserved identity", "id"));
    }
    if (changed(prior, expected) && !observed.verified) diagnostics.push(finding("UNVERIFIED_ACTUAL", key, "the artifact owner did not verify the read-back state"));
  }
  for (const key of actual.byKey.keys()) {
    if (!proposed.byKey.has(key)) diagnostics.push(finding("UNEXPECTED_ACTUAL", key, "read-back contains an unapproved artifact"));
  }
  return diagnostics;
}

function validateCanonicalTransaction(raw, requiredPhase) {
  const diagnostics = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, diagnostics: [finding("INVALID_TRANSACTION", "transaction", "transaction must be an object")] };
  }
  for (const field of Object.keys(raw)) {
    if (!TRANSACTION_FIELDS.has(field)) diagnostics.push(finding("UNKNOWN_FIELD", "transaction", `unsupported transaction field: ${field}`, field));
  }
  if (raw.version !== 1) diagnostics.push(finding("INVALID_VERSION", "transaction", "version must be 1"));
  if (typeof raw.transaction !== "string" || !raw.transaction.trim()) diagnostics.push(finding("MISSING_TRANSACTION", "transaction", "transaction id is required"));
  if (!new Set(["proposed", "applied"]).has(raw.phase)) diagnostics.push(finding("INVALID_PHASE", "transaction", "phase must be proposed or applied"));
  if (requiredPhase && raw.phase !== requiredPhase) diagnostics.push(finding("INCOMPLETE_TRANSACTION", "transaction", `phase must be ${requiredPhase}`));

  const before = normalizeSnapshot(raw.before, "before", diagnostics);
  const proposed = normalizeSnapshot(raw.proposed, "proposed", diagnostics);
  diagnostics.push(...checkProposal(before, proposed));

  let actual;
  if (raw.phase === "applied" || requiredPhase === "applied") {
    if (raw.actual === undefined) {
      diagnostics.push(finding("INCOMPLETE_TRANSACTION", "transaction", "an applied transaction adds actual: the records as the support read them back", "actual"));
    } else {
      actual = normalizeSnapshot(raw.actual, "actual", diagnostics);
      diagnostics.push(...checkActual(before, proposed, actual));
    }
  }
  diagnostics.sort((left, right) => {
    const a = stable([left.path, left.code, left.field || ""]);
    const b = stable([right.path, right.code, right.field || ""]);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return { valid: diagnostics.length === 0, diagnostics, normalized: { before, proposed, actual } };
}

module.exports = { supportIdentity, validateCanonicalTransaction, withoutNulls };

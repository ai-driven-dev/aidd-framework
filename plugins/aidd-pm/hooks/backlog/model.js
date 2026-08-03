// The read model an orchestrator inspects: artifacts and the links between them.

const { RELATIONS } = require("./contract.js");
const { relationValues, resolveLocalTarget } = require("./read.js");

const PLANNING_FIELDS = ["source", "order", "estimate", "work_kind"];

function toEntry(artifact) {
  const relations = {};
  for (const field of RELATIONS) {
    if (Object.hasOwn(artifact.metadata, field)) relations[field] = relationValues(artifact.metadata, field);
  }
  const planning = Object.fromEntries(
    PLANNING_FIELDS.filter((field) => Object.hasOwn(artifact.metadata, field)).map((field) => [
      field,
      field === "order" ? Number(artifact.metadata[field]) : artifact.metadata[field],
    ]),
  );
  return {
    id: artifact.path,
    path: artifact.path,
    title: artifact.title,
    type: artifact.type,
    status: artifact.status,
    ...planning,
    ...(Object.keys(relations).length > 0 ? { relations } : {}),
  };
}

function toEdges(artifact, project) {
  const fields = Object.hasOwn(artifact.metadata, "source") ? ["source", ...RELATIONS] : RELATIONS;
  return fields.flatMap((relation) =>
    relationValues(artifact.metadata, relation).map((value) => {
      const local = resolveLocalTarget(value, project);
      return { from: artifact.path, to: local || value, relation, local: Boolean(local) };
    }),
  );
}

function countByType(artifacts) {
  const counts = { epic: 0, story: 0, task: 0, spike: 0, defect: 0 };
  for (const artifact of artifacts) {
    if (Object.hasOwn(counts, artifact.type)) counts[artifact.type] += 1;
  }
  return counts;
}

function buildModel(artifacts, project, fileCount) {
  return {
    artifacts: artifacts.map(toEntry),
    edges: artifacts.flatMap((artifact) => toEdges(artifact, project)),
    stats: { files: fileCount, ...countByType(artifacts) },
  };
}

module.exports = { buildModel };

// The backlog contract, in one place. scripts/__tests__/check-backlog.test.js pins every
// row here against what the skills document; a rule with no row is enforced by its skill alone.

const STATUSES = {
  epic: new Set(["proposed", "ready", "in-progress", "done", "cancelled"]),
  story: new Set(["proposed", "ready", "in-progress", "done", "cancelled"]),
  task: new Set(["proposed", "ready", "in-progress", "done", "cancelled"]),
  spike: new Set(["open", "in-progress", "blocked", "resolved", "inconclusive", "cancelled"]),
  defect: new Set(["reported", "ready", "in-progress", "done", "cancelled"]),
};

// Where a status may move next. The `May move to` column of each lifecycle mirrors this.
const TRANSITIONS = {
  epic: {
    proposed: ["ready", "cancelled"],
    ready: ["proposed", "in-progress", "cancelled"],
    "in-progress": ["ready", "done", "cancelled"],
    done: [],
    cancelled: [],
  },
  story: {
    proposed: ["ready", "cancelled"],
    ready: ["proposed", "in-progress", "cancelled"],
    "in-progress": ["ready", "done", "cancelled"],
    done: [],
    cancelled: [],
  },
  task: {
    proposed: ["ready", "cancelled"],
    ready: ["proposed", "in-progress", "cancelled"],
    "in-progress": ["ready", "done", "cancelled"],
    done: [],
    cancelled: [],
  },
  spike: {
    open: ["in-progress", "cancelled"],
    "in-progress": ["blocked", "resolved", "inconclusive", "cancelled"],
    blocked: ["in-progress", "cancelled"],
    resolved: [],
    inconclusive: ["in-progress"],
    cancelled: [],
  },
  defect: {
    reported: ["ready", "cancelled"],
    ready: ["reported", "in-progress", "cancelled"],
    "in-progress": ["ready", "done", "cancelled"],
    done: [],
    cancelled: [],
  },
};

// A status is terminal when nothing may follow it.
const TERMINAL = Object.fromEntries(
  Object.entries(TRANSITIONS).map(([type, moves]) => [
    type,
    new Set(Object.entries(moves).filter(([, next]) => next.length === 0).map(([status]) => status)),
  ]),
);


const FOLDERS = { epic: "epics", story: "stories", task: "tasks", spike: "spikes", defect: "defects" };

const RELATIONS = ["goal", "parent", "parents", "depends_on", "related_to", "supersedes"];
const LIST_FIELDS = new Set(["parents", "depends_on", "related_to", "supersedes"]);
const METADATA_FIELDS = ["type", "status", "source", ...RELATIONS, "order", "estimate", "work_kind"];

// Fields an artifact type may never carry, inverse links included.
const FORBIDDEN = {
  epic: new Set(["parent", "parents", "children", "blocked_by", "superseded_by", "work_kind"]),
  story: new Set(["goal", "parents", "children", "blocked_by", "superseded_by", "work_kind"]),
  task: new Set(["goal", "parents", "children", "blocked_by", "superseded_by"]),
  spike: new Set(["goal", "parent", "children", "blocked_by", "superseded_by", "order", "estimate", "work_kind"]),
  defect: new Set(["goal", "parent", "parents", "children", "blocked_by", "superseded_by", "work_kind"]),
};

// Which artifact a parent link may point at.
const PARENT_RULES = {
  story: { field: "parent", allowed: ["epic"], message: "Story parent must be an Epic" },
  task: { field: "parent", allowed: ["epic", "story", "defect"], message: "Task parent must be an Epic, Story, or Defect" },
  spike: { field: "parents", allowed: ["epic", "story", "task"], message: "Spike parents must be Epics, Stories, or Tasks" },
};

// What a body must show once an artifact reaches a status.
const REQUIRED_SECTIONS = [
  { type: "epic", statuses: ["ready", "in-progress", "done"], sections: ["Success Evidence"], code: "MISSING_SUCCESS_EVIDENCE", label: "ready Epic" },
  { type: "story", statuses: ["ready", "in-progress", "done"], sections: ["Acceptance"], code: "MISSING_ACCEPTANCE", label: "ready Story" },
  { type: "task", statuses: ["ready", "in-progress", "done"], sections: ["Outcome", "Scope", "Done When"], code: "INCOMPLETE_TASK", label: "active Task" },
  { type: "task", statuses: ["done"], sections: ["Completion Evidence"], code: "MISSING_TASK_EVIDENCE", label: "done Task" },
  { type: "defect", statuses: ["ready", "in-progress", "done"], sections: ["Expected", "Actual", "Reproduction", "Impact", "Evidence"], code: "INCOMPLETE_DEFECT", label: "active Defect" },
  { type: "defect", statuses: ["done"], sections: ["Verification"], code: "MISSING_DEFECT_VERIFICATION", label: "done Defect" },
  { type: "spike", statuses: ["resolved", "inconclusive"], sections: ["Outcome", "Follow-up"], code: "MISSING_SPIKE_OUTCOME", label: "concluded Spike" },
  { type: "epic", statuses: ["cancelled"], sections: ["Cancellation"], code: "MISSING_CANCELLATION", label: "cancelled Epic" },
  { type: "story", statuses: ["cancelled"], sections: ["Cancellation"], code: "MISSING_CANCELLATION", label: "cancelled Story" },
  { type: "task", statuses: ["cancelled"], sections: ["Cancellation"], code: "MISSING_CANCELLATION", label: "cancelled Task" },
  { type: "spike", statuses: ["cancelled"], sections: ["Cancellation"], code: "MISSING_CANCELLATION", label: "cancelled Spike" },
  { type: "defect", statuses: ["cancelled"], sections: ["Cancellation"], code: "MISSING_CANCELLATION", label: "cancelled Defect" },
];

// Findings one artifact cannot prove alone. A single write is never a transaction,
// so the write-time hook stays silent on these and verification judges the final graph.
const GRAPH_CODES = new Set([
  "ACTIVE_SUPERSEDED",
  "DUPLICATE_ORDER",
  "INVALID_GOAL_TYPE",
  "INVALID_PARENT_TYPE",
  "LIVE_CHILD",
  "MIRRORED_RELATION",
  "MISSING_SOURCE",
  "MISSING_TARGET",
  "RELATION_CYCLE",
]);

module.exports = {
  FOLDERS,
  FORBIDDEN,
  GRAPH_CODES,
  LIST_FIELDS,
  METADATA_FIELDS,
  PARENT_RULES,
  RELATIONS,
  REQUIRED_SECTIONS,
  STATUSES,
  TERMINAL,
  TRANSITIONS,
};

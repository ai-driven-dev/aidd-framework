const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const test = require("node:test");

const script = path.resolve(__dirname, "../../plugins/aidd-pm/hooks/check-backlog.js");
const observeHook = path.resolve(__dirname, "../../plugins/aidd-pm/hooks/observe-backlog.js");
const verifyHook = path.resolve(__dirname, "../../plugins/aidd-pm/hooks/verify-backlog.js");
const { validateCanonicalTransaction } = require("../../plugins/aidd-pm/hooks/backlog/canonical-transaction.js");
const { clearJournal, fileFor, readJournal } = require("../../plugins/aidd-pm/hooks/backlog/journal.js");
const {
  FOLDERS,
  FORBIDDEN,
  GRAPH_CODES,
  PARENT_RULES,
  REQUIRED_SECTIONS,
  STATUSES,
  TRANSITIONS,
  inspectBacklog,
  inspectChange,
  parseFrontmatter,
  patchedContent,
  touchesBacklog,
} = require(script);

const skills = path.resolve(__dirname, "../../plugins/aidd-pm/skills");
const ARTIFACT_SKILL = {
  epic: "07-epic",
  story: "02-user-stories",
  task: "10-task",
  spike: "05-spike",
  defect: "09-defect",
};
const WRITE_ACTIONS = [
  "02-user-stories/actions/07-finalize.md",
  "03-prd/actions/01-prd.md",
  "04-spec/actions/01-build.md",
  "04-spec/actions/02-refine.md",
  "05-spike/actions/01-create.md",
  "05-spike/actions/03-conclude.md",
  "06-product-brief/actions/05-finalize.md",
  "07-epic/actions/03-finalize.md",
  "09-defect/actions/03-finalize.md",
  "10-task/actions/03-finalize.md",
];

function firstColumn(table) {
  return table
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line))
    .slice(1)
    .map((line) => line.split("|")[1].trim());
}

function backticked(text) {
  return [...text.matchAll(/`([a-z_-]+)`/g)].map((match) => match[1]);
}

function project(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-backlog-"));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

function codes(result) {
  return result.diagnostics.map((item) => item.code);
}

function runHook(hook, payload) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
}

function runHookAsync(hook, payload) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [hook]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(JSON.stringify(payload));
  });
}

function artifact(key, type, status, extra = {}) {
  const value = { key, id: `support:${key}`, type, status, verified: false, ...extra };
  if (value.id === undefined) delete value.id;
  return value;
}

function transaction(phase = "proposed") {
  const parent = artifact("epic-1", "epic", "ready");
  const child = artifact("story-1", "story", "proposed", {
    id: undefined,
    relations: { parent: "epic-1" },
    order: 1,
    fields: { milestone: "M1" },
    verified: true,
  });
  const result = {
    version: 1,
    transaction: "tx-1",
    phase,
    before: [parent],
    proposed: [parent, child],
  };
  if (phase === "applied") {
    result.actual = [parent, { ...child, id: "linear:STORY-42" }];
  }
  return result;
}

const epic = (status = "ready", extra = "") => `---
type: epic
status: ${status}
${extra}---

# Epic

## Success Evidence

- outcome observed
`;

const story = (status = "ready", extra = "") => `---
type: story
status: ${status}
${extra}---

# Story

## Acceptance

- behavior observed
`;

const task = (status = "ready", extra = "", evidence = "") => `---
type: task
status: ${status}
${extra}---

# Task

## Outcome

One delivery result.

## Scope

- One boundary.

## Done When

- Completion is observable.

${evidence}
`;

const spike = (status = "open", extra = "") => `---
type: spike
status: ${status}
${extra}---

# Spike

## Outcome

- answer

## Follow-up

- update parent
`;

const defect = (status = "reported", extra = "", body = "") => `---
type: defect
status: ${status}
${extra}---

# Defect: Checkout total mismatch

${body}
`;

test("missing backlog is an empty valid graph", () => {
  const result = inspectBacklog(project());
  assert.equal(result.valid, true);
  assert.equal(result.stats.files, 0);
});

test("inspection is read-only", () => {
  const root = project({ "aidd_docs/backlog/epics/epic.md": epic() });
  const target = path.join(root, "aidd_docs/backlog/epics/epic.md");
  const before = fs.statSync(target);
  const content = fs.readFileSync(target, "utf8");
  inspectBacklog(root);
  const after = fs.statSync(target);
  assert.equal(fs.readFileSync(target, "utf8"), content);
  assert.equal(after.mode, before.mode);
  assert.equal(after.mtimeMs, before.mtimeMs);
});

test("valid Epic, Story, Task, Spike, and Defect graph", () => {
  const root = project({
    "aidd_docs/backlog/epics/payments.md": epic(),
    "aidd_docs/backlog/stories/checkout.md": story(
      "ready",
      "parent: aidd_docs/backlog/epics/payments.md\norder: 1\nestimate: M\n",
    ),
    "aidd_docs/backlog/tasks/checkout-api.md": task(
      "ready",
      "parent: aidd_docs/backlog/stories/checkout.md\nwork_kind: technical\norder: 1\nestimate: S\n",
    ),
    "aidd_docs/backlog/spikes/provider.md": spike(
      "resolved",
      "parents:\n  - aidd_docs/backlog/tasks/checkout-api.md\nrelated_to: [EXT-42]\n",
    ),
    "aidd_docs/backlog/defects/total.md": defect(
      "ready",
      "related_to: [aidd_docs/backlog/stories/checkout.md]\norder: 2\nestimate: S\n",
      "## Expected\n\nCorrect total.\n\n## Actual\n\nIncorrect total.\n\n## Reproduction\n\nAdd two items, open the cart.\n\n## Impact\n\nCheckout fails.\n\n## Evidence\n\n- Report R-1\n",
    ),
  });
  const result = inspectBacklog(root);
  assert.equal(result.valid, true);
  assert.deepEqual(result.stats, { files: 5, epic: 1, story: 1, task: 1, spike: 1, defect: 1 });
});

test("frontmatter parser accepts inline and block lists", () => {
  const parsed = parseFrontmatter("\uFEFF---\r\ntype: spike\r\nparents: [EP-1, US-2]\r\ndepends_on:\r\n  - SP-1\r\n---\r\n");
  assert.deepEqual(parsed.data.parents, ["EP-1", "US-2"]);
  assert.deepEqual(parsed.data.depends_on, ["SP-1"]);
});

test("missing, unclosed, unsupported, and duplicate frontmatter fail", () => {
  for (const content of [
    "# No metadata",
    "---\ntype: story",
    "---\ntype: story\n nested: value\n---",
    "---\ntype: story\ntype: story\n---",
  ]) {
    const root = project({ "aidd_docs/backlog/item.md": content });
    assert.ok(codes(inspectBacklog(root)).includes("INVALID_FRONTMATTER"));
  }
});

test("file count includes artifacts with invalid frontmatter", () => {
  const root = project({
    "aidd_docs/backlog/stories/valid.md": story(),
    "aidd_docs/backlog/stories/invalid.md": "# Missing frontmatter\n",
  });
  const result = inspectBacklog(root);
  assert.equal(result.stats.files, 2);
  assert.equal(result.stats.story, 1);
});

test("embedded artifact frontmatter fails while a horizontal rule remains valid", () => {
  const root = project({
    "aidd_docs/backlog/epics/rule.md": `${epic()}\n---\n\nSupporting detail.\n`,
    "aidd_docs/backlog/epics/embedded.md":
      `${epic()}\n---\n\ntype: story\nstatus: proposed\n---\n\n# Story: misplaced\n`,
    "aidd_docs/backlog/epics/example.md":
      `${epic()}\n\`\`\`yaml\n---\ntype: story\nstatus: proposed\n---\n\`\`\`\n`,
  });

  assert.deepEqual(codes(inspectBacklog(root)), ["EMBEDDED_FRONTMATTER"]);
});

test("frontmatter copied into the preamble, a heading, or a table fails", () => {
  const preamble = (line) =>
    `---\ntype: epic\nstatus: ready\n---\n\n# Epic\n\n${line}\n\n## Success Evidence\n\n- outcome observed\n`;
  for (const line of ["**Status:** proposed", "- **Status:** proposed", "## Status: proposed"]) {
    const root = project({
      "aidd_docs/backlog/epics/body-metadata.md": preamble(line),
      "aidd_docs/backlog/epics/example.md":
        `${epic()}\n\`\`\`yaml\nstatus: proposed\n\`\`\`\n\n    status: proposed\n`,
    });
    assert.deepEqual(codes(inspectBacklog(root)), ["BODY_METADATA"]);
  }
  const table = project({
    "aidd_docs/backlog/epics/table.md": `${epic()}\n| **Status:** | proposed |\n`,
  });
  assert.deepEqual(codes(inspectBacklog(table)), ["BODY_METADATA"]);
});

test("field words inside a section are prose, not metadata", () => {
  const root = project({
    "aidd_docs/backlog/defects/evidence.md": defect(
      "reported",
      "",
      "## Evidence\n\n- source: https://support.example.com/ticket/4821\n",
    ),
    "aidd_docs/backlog/stories/acceptance.md":
      `${story("ready")}\n- order: results are sorted by relevance\n`,
  });
  assert.deepEqual(codes(inspectBacklog(root)), []);
});

test("unknown type and type-specific status fail", () => {
  const root = project({
    "aidd_docs/backlog/stories/unknown.md": "---\ntype: chore\nstatus: open\n---\n",
    "aidd_docs/backlog/stories/story.md": story("open"),
    "aidd_docs/backlog/defects/defect.md": defect("proposed"),
  });
  assert.deepEqual(codes(inspectBacklog(root)).sort(), ["INVALID_STATUS", "INVALID_STATUS", "INVALID_TYPE"]);
});

test("inverse and wrong-owner fields fail", () => {
  const root = project({
    "aidd_docs/backlog/epics/epic.md": epic("ready", "children: [US-1]\nwork_kind: technical\n"),
    "aidd_docs/backlog/stories/story.md": story("ready", "parents: [EP-1]\n"),
    "aidd_docs/backlog/spikes/spike.md": spike("open", "parent: EP-1\nestimate: M\n"),
  });
  assert.equal(codes(inspectBacklog(root)).filter((code) => code === "FIELD_OWNER").length, 5);
});

test("empty, malformed, and duplicate relations fail", () => {
  const root = project({
    "aidd_docs/backlog/stories/story.md": story("ready", "parent:\nrelated_to: [A, A]\n"),
  });
  const result = inspectBacklog(root);
  assert.ok(codes(result).includes("INVALID_RELATION"));
  assert.ok(codes(result).includes("DUPLICATE_RELATION"));
});

test("a field that may hold several accepts one written plainly", () => {
  const root = project({
    "aidd_docs/backlog/stories/old.md": `${story("cancelled")}\n## Cancellation\n\nSuperseded.\n`,
    "aidd_docs/backlog/stories/new.md": story("ready", "supersedes: aidd_docs/backlog/stories/old.md\n"),
    "aidd_docs/backlog/stories/two.md": story("ready", "parent: [EP-1, EP-2]\n"),
  });
  const findings = inspectBacklog(root).diagnostics;
  assert.deepEqual(
    findings.map((item) => `${item.code} ${item.path}`),
    ["INVALID_RELATION aidd_docs/backlog/stories/two.md"],
  );
});

test("Epic goal resolves outside the backlog and belongs only to Epic", () => {
  const valid = project({
    "aidd_docs/tasks/product/product-brief.md": "# Product Brief\n",
    "aidd_docs/backlog/epics/epic.md": epic("ready", "goal: aidd_docs/tasks/product/product-brief.md\n"),
  });
  assert.equal(inspectBacklog(valid).valid, true);

  const invalid = project({
    "aidd_docs/backlog/epics/epic.md": epic("ready", "goal: aidd_docs/tasks/missing/product-brief.md\n"),
    "aidd_docs/backlog/stories/story.md": story("ready", "goal: GOAL-1\n"),
  });
  assert.ok(codes(inspectBacklog(invalid)).includes("MISSING_TARGET"));
  assert.ok(codes(inspectBacklog(invalid)).includes("FIELD_OWNER"));
});

test("Epic goal is distinct from its source and never a backlog artifact", () => {
  const root = project({
    "aidd_docs/backlog/epics/goal.md": epic(),
    "aidd_docs/backlog/epics/epic.md": epic(
      "ready",
      "source: GOAL-1\ngoal: GOAL-1\nrelated_to: [aidd_docs/backlog/epics/goal.md]\n",
    ),
    "aidd_docs/backlog/epics/invalid.md": epic(
      "ready",
      "goal: aidd_docs/backlog/epics/goal.md\n",
    ),
  });
  const result = inspectBacklog(root);
  assert.ok(codes(result).includes("DUPLICATE_SEMANTIC_RELATION"));
  assert.ok(codes(result).includes("INVALID_GOAL_TYPE"));
});

test("missing local target fails while tracker ids and Markdown URLs remain external", () => {
  const root = project({
    "aidd_docs/backlog/epics/epic.md": epic("ready", "depends_on: [EP-9, https://tracker.test/context.md, aidd_docs/backlog/epics/missing.md]\n"),
  });
  assert.deepEqual(codes(inspectBacklog(root)), ["MISSING_TARGET"]);
});

test("missing local source fails while an external source URL remains valid", () => {
  const missing = project({
    "aidd_docs/backlog/epics/epic.md": epic("ready", "source: aidd_docs/tasks/missing/product-brief.md\n"),
  });
  assert.ok(codes(inspectBacklog(missing)).includes("MISSING_SOURCE"));

  const external = project({
    "aidd_docs/backlog/epics/epic.md": epic("ready", "source: https://example.test/product-brief.md\n"),
  });
  assert.equal(inspectBacklog(external).valid, true);
});

test("Story parent must resolve to an Epic", () => {
  const root = project({
    "aidd_docs/backlog/stories/a.md": story(
      "ready",
      "parent: aidd_docs/backlog/stories/b.md\n",
    ),
    "aidd_docs/backlog/stories/b.md": story(),
  });
  assert.ok(codes(inspectBacklog(root)).includes("INVALID_PARENT_TYPE"));
});

test("Task parent must resolve to an Epic, Story, or Defect", () => {
  const root = project({
    "aidd_docs/backlog/tasks/task.md": task(
      "ready",
      "parent: aidd_docs/backlog/tasks/parent.md\n",
    ),
    "aidd_docs/backlog/tasks/parent.md": task(),
  });
  assert.ok(codes(inspectBacklog(root)).includes("INVALID_PARENT_TYPE"));
});

test("Spike parents must resolve to Epics, Stories, or Tasks", () => {
  const root = project({
    "aidd_docs/backlog/spikes/a.md": spike(
      "open",
      "parents:\n  - aidd_docs/backlog/spikes/b.md\n",
    ),
    "aidd_docs/backlog/spikes/b.md": spike(),
  });
  assert.ok(codes(inspectBacklog(root)).includes("INVALID_PARENT_TYPE"));
});

test("a terminal parent cannot retain a live child", () => {
  const root = project({
    "aidd_docs/backlog/epics/done.md": epic("done"),
    "aidd_docs/backlog/stories/live.md": story(
      "ready",
      "parent: aidd_docs/backlog/epics/done.md\n",
    ),
  });
  assert.deepEqual(codes(inspectBacklog(root)), ["LIVE_CHILD"]);
});

test("depends_on cycle fails", () => {
  const root = project({
    "aidd_docs/backlog/stories/a.md": story("ready", "depends_on: [aidd_docs/backlog/stories/b.md]\n"),
    "aidd_docs/backlog/stories/b.md": story("ready", "depends_on: [aidd_docs/backlog/stories/a.md]\n"),
  });
  assert.ok(codes(inspectBacklog(root)).includes("RELATION_CYCLE"));
});

test("supersedes cycle fails", () => {
  const root = project({
    "aidd_docs/backlog/epics/a.md": epic("ready", "supersedes: [aidd_docs/backlog/epics/b.md]\n"),
    "aidd_docs/backlog/epics/b.md": epic("ready", "supersedes: [aidd_docs/backlog/epics/a.md]\n"),
  });
  assert.ok(codes(inspectBacklog(root)).includes("RELATION_CYCLE"));
});

test("supersedes requires a terminal target", () => {
  const active = project({
    "aidd_docs/backlog/spikes/old.md": spike("open"),
    "aidd_docs/backlog/spikes/new.md": spike("open", "supersedes: [aidd_docs/backlog/spikes/old.md]\n"),
  });
  assert.ok(codes(inspectBacklog(active)).includes("ACTIVE_SUPERSEDED"));

  const terminal = project({
    "aidd_docs/backlog/spikes/old.md": `${spike("cancelled")}\n## Cancellation\n\nQuestion changed.\n`,
    "aidd_docs/backlog/spikes/new.md": spike("open", "supersedes: [aidd_docs/backlog/spikes/old.md]\n"),
  });
  assert.equal(inspectBacklog(terminal).valid, true);
});

test("mirrored related_to fails", () => {
  const root = project({
    "aidd_docs/backlog/stories/a.md": story("ready", "related_to: [aidd_docs/backlog/stories/b.md]\n"),
    "aidd_docs/backlog/stories/b.md": story("ready", "related_to: [aidd_docs/backlog/stories/a.md]\n"),
  });
  const [finding] = inspectBacklog(root).diagnostics;
  assert.equal(finding.code, "MIRRORED_RELATION");
  assert.equal(finding.path, "aidd_docs/backlog/stories/a.md");
  assert.match(finding.message, /remove it from aidd_docs\/backlog\/stories\/b\.md/);
});

test("Story order must be a positive integer", () => {
  const root = project({ "aidd_docs/backlog/stories/story.md": story("ready", "order: 0\n") });
  assert.ok(codes(inspectBacklog(root)).includes("INVALID_ORDER"));
});

test("Story order is unique within one parent", () => {
  const duplicate = project({
    "aidd_docs/backlog/epics/a.md": epic(),
    "aidd_docs/backlog/stories/a.md": story("ready", "parent: aidd_docs/backlog/epics/a.md\norder: 1\n"),
    "aidd_docs/backlog/stories/b.md": story("ready", "parent: aidd_docs/backlog/epics/a.md\norder: 1\n"),
  });
  assert.ok(codes(inspectBacklog(duplicate)).includes("DUPLICATE_ORDER"));

  const distinct = project({
    "aidd_docs/backlog/epics/a.md": epic(),
    "aidd_docs/backlog/epics/b.md": epic(),
    "aidd_docs/backlog/stories/a.md": story("ready", "parent: aidd_docs/backlog/epics/a.md\norder: 1\n"),
    "aidd_docs/backlog/stories/b.md": story("ready", "parent: aidd_docs/backlog/epics/b.md\norder: 1\n"),
  });
  assert.equal(inspectBacklog(distinct).valid, true);

  const equivalent = project({
    "aidd_docs/backlog/epics/a.md": epic(),
    "aidd_docs/backlog/stories/a.md": story("ready", "parent: aidd_docs/backlog/epics/a.md\norder: 1\n"),
    "aidd_docs/backlog/stories/b.md": story("ready", "parent: aidd_docs/backlog/epics/a.md\norder: 01\n"),
  });
  assert.ok(codes(inspectBacklog(equivalent)).includes("DUPLICATE_ORDER"));
});

test("Task order is unique within one parent", () => {
  const root = project({
    "aidd_docs/backlog/stories/story.md": story(),
    "aidd_docs/backlog/tasks/a.md": task(
      "ready",
      "parent: aidd_docs/backlog/stories/story.md\norder: 1\n",
    ),
    "aidd_docs/backlog/tasks/b.md": task(
      "ready",
      "parent: aidd_docs/backlog/stories/story.md\norder: 1\n",
    ),
  });
  assert.ok(codes(inspectBacklog(root)).includes("DUPLICATE_ORDER"));
});

test("Task classification and completion evidence are validated", () => {
  const invalid = project({
    "aidd_docs/backlog/tasks/kind.md": task("ready", "work_kind: product\n"),
    "aidd_docs/backlog/tasks/incomplete.md": "---\ntype: task\nstatus: ready\n---\n# Task\n",
    "aidd_docs/backlog/tasks/done.md": task("done"),
  });
  assert.deepEqual(codes(inspectBacklog(invalid)).sort(), [
    "INCOMPLETE_TASK",
    "INVALID_WORK_KIND",
    "MISSING_TASK_EVIDENCE",
  ]);

  const complete = project({
    "aidd_docs/backlog/tasks/done.md": task(
      "done",
      "work_kind: functional\n",
      "## Completion Evidence\n\n- Verified.\n",
    ),
  });
  assert.equal(inspectBacklog(complete).valid, true);
});

test("Epic order is unique across the Epic backlog", () => {
  const root = project({
    "aidd_docs/backlog/epics/a.md": epic("ready", "order: 1\n"),
    "aidd_docs/backlog/epics/b.md": epic("ready", "order: 1\nestimate: L\n"),
  });
  assert.deepEqual(codes(inspectBacklog(root)), ["DUPLICATE_ORDER"]);
});

test("Defect order is unique across the Defect backlog", () => {
  const root = project({
    "aidd_docs/backlog/defects/a.md": defect("reported", "order: 1\n"),
    "aidd_docs/backlog/defects/b.md": defect("reported", "order: 1\n"),
  });
  assert.ok(codes(inspectBacklog(root)).includes("DUPLICATE_ORDER"));
});

test("active and done Defects require earned evidence", () => {
  const incomplete = project({
    "aidd_docs/backlog/defects/incomplete.md": defect("ready"),
    "aidd_docs/backlog/defects/done.md": defect(
      "done",
      "",
      "## Expected\n\nA.\n\n## Actual\n\nB.\n\n## Reproduction\n\nSteps.\n\n## Impact\n\nC.\n\n## Evidence\n\nD.\n",
    ),
  });
  assert.deepEqual(codes(inspectBacklog(incomplete)).sort(), [
    "INCOMPLETE_DEFECT",
    "MISSING_DEFECT_VERIFICATION",
  ]);

  const complete = project({
    "aidd_docs/backlog/defects/done.md": defect(
      "done",
      "",
      "## Expected\n\nA.\n\n## Actual\n\nB.\n\n## Reproduction\n\nSteps.\n\n## Impact\n\nC.\n\n## Evidence\n\nD.\n\n## Verification\n\nVerified.\n",
    ),
  });
  assert.equal(inspectBacklog(complete).valid, true);
});

test("JSON read model exposes titles, relations, and source edges", () => {
  const root = project({
    "aidd_docs/tasks/product/product-brief.md": "# Product Brief\n",
    "aidd_docs/backlog/epics/payments.md": epic(
      "ready",
      "source: REQ-1\ngoal: aidd_docs/tasks/product/product-brief.md\n",
    ),
    "aidd_docs/backlog/stories/checkout.md": story(
      "ready",
      "parent: aidd_docs/backlog/epics/payments.md\n",
    ),
  });
  const result = inspectBacklog(root);
  assert.deepEqual(result.artifacts[0], {
    id: "aidd_docs/backlog/epics/payments.md",
    path: "aidd_docs/backlog/epics/payments.md",
    title: "Epic",
    type: "epic",
    status: "ready",
    source: "REQ-1",
    relations: { goal: ["aidd_docs/tasks/product/product-brief.md"] },
  });
  assert.deepEqual(result.edges, [
    {
      from: "aidd_docs/backlog/epics/payments.md",
      to: "REQ-1",
      relation: "source",
      local: false,
    },
    {
      from: "aidd_docs/backlog/epics/payments.md",
      to: "aidd_docs/tasks/product/product-brief.md",
      relation: "goal",
      local: true,
    },
    {
      from: "aidd_docs/backlog/stories/checkout.md",
      to: "aidd_docs/backlog/epics/payments.md",
      relation: "parent",
      local: true,
    },
  ]);
});

test("read model metadata cannot replace canonical identity", () => {
  const root = project({
    "aidd_docs/backlog/epics/e.md": epic(
      "ready",
      "id: forged\npath: forged.md\ntitle: Forged\n",
    ),
  });
  const [artifact] = inspectBacklog(root).artifacts;
  assert.equal(artifact.id, "aidd_docs/backlog/epics/e.md");
  assert.equal(artifact.path, "aidd_docs/backlog/epics/e.md");
  assert.equal(artifact.title, "Epic");
});

test("valid artifact needs an H1 title", () => {
  const root = project({
    "aidd_docs/backlog/defects/no-title.md": "---\ntype: defect\nstatus: reported\n---\nNo title.\n",
    "aidd_docs/backlog/defects/code-title.md": "---\ntype: defect\nstatus: reported\n---\n```\n# Defect: not a title\n```\n",
  });
  assert.deepEqual(codes(inspectBacklog(root)), ["MISSING_TITLE", "MISSING_TITLE"]);
});

test("done artifacts require their decisive body evidence", () => {
  const root = project({
    "aidd_docs/backlog/epics/epic.md": "---\ntype: epic\nstatus: done\n---\n# Epic\n",
    "aidd_docs/backlog/stories/story.md": "---\ntype: story\nstatus: done\n---\n# Story\n",
    "aidd_docs/backlog/tasks/task.md": "---\ntype: task\nstatus: done\n---\n# Task\n",
    "aidd_docs/backlog/spikes/spike.md": "---\ntype: spike\nstatus: resolved\n---\n# Spike\n",
  });
  assert.deepEqual(codes(inspectBacklog(root)).sort(), [
    "INCOMPLETE_TASK",
    "MISSING_ACCEPTANCE",
    "MISSING_SPIKE_OUTCOME",
    "MISSING_SUCCESS_EVIDENCE",
    "MISSING_TASK_EVIDENCE",
  ]);
});

test("a cancelled artifact records why", () => {
  const root = project({
    "aidd_docs/backlog/epics/silent.md": epic("cancelled"),
    "aidd_docs/backlog/epics/explained.md": `${epic("cancelled")}\n## Cancellation\n\nThe partner left.\n`,
  });
  assert.deepEqual(
    inspectBacklog(root).diagnostics.map((item) => `${item.code} ${item.path}`),
    ["MISSING_CANCELLATION aidd_docs/backlog/epics/silent.md"],
  );
});

test("hook path detection ignores unrelated writes", () => {
  assert.equal(touchesBacklog({ tool_input: { file_path: "src/app.ts" } }), false);
  assert.equal(
    touchesBacklog({ tool_input: { file_path: "/repo/aidd_docs/backlog/stories/a.md" } }),
    true,
  );
  assert.equal(touchesBacklog({ input: { path: "aidd_docs\\backlog\\epics\\a.md" } }), true);
  assert.equal(
    touchesBacklog({ tool_input: { patch: "*** Update File: aidd_docs/backlog/stories/a.md" } }),
    true,
  );
});

test("wrong directory for an artifact type fails", () => {
  const root = project({ "aidd_docs/backlog/epics/story.md": story() });
  assert.ok(codes(inspectBacklog(root)).includes("INVALID_PATH"));
});

test("empty optional source fails", () => {
  const root = project({ "aidd_docs/backlog/stories/story.md": story("ready", "source:\n") });
  assert.ok(codes(inspectBacklog(root)).includes("INVALID_SOURCE"));
});

test("CLI exits nonzero and returns JSON for an invalid backlog", () => {
  const root = project({ "aidd_docs/backlog/stories/story.md": story("open") });
  const result = spawnSync(process.execPath, [script, root, "--json"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).diagnostics[0].code, "INVALID_STATUS");
});

test("hook ignores unrelated writes even when the backlog is invalid", () => {
  const root = project({ "aidd_docs/backlog/stories/story.md": story("open") });
  const result = spawnSync(process.execPath, [script, "--hook"], {
    cwd: root,
    input: JSON.stringify({ tool_input: { file_path: "src/app.ts" } }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("every diagnostic declares whether one file can prove it", () => {
  const root = project({
    "aidd_docs/backlog/stories/story.md": story("open", "parent: aidd_docs/backlog/epics/absent.md\n"),
  });
  const scopes = new Map(inspectBacklog(root).diagnostics.map((item) => [item.code, item.scope]));
  assert.deepEqual([...scopes.entries()].sort(), [
    ["INVALID_STATUS", "file"],
    ["MISSING_TARGET", "graph"],
  ]);

  // Every code the Markdown checker can emit, not only the two this scenario raises.
  const emitted = new Set();
  for (const file of ["artifact-rules", "graph-rules", "change-rules", "read", "markdown"]) {
    const source = fs.readFileSync(path.resolve(__dirname, `../../plugins/aidd-pm/hooks/backlog/${file}.js`), "utf8");
    for (const match of source.matchAll(/(?:diagnostic|report)\(\s*"([A-Z_]+)"/g)) emitted.add(match[1]);
  }
  assert.ok(emitted.size >= 20, `only ${emitted.size} codes found`);
  for (const code of GRAPH_CODES) {
    assert.ok(emitted.has(code), `${code} is declared graph-scope but nothing emits it`);
  }
  const graphSource = fs.readFileSync(path.resolve(__dirname, "../../plugins/aidd-pm/hooks/backlog/graph-rules.js"), "utf8");
  for (const match of graphSource.matchAll(/(?:diagnostic|report)\(\s*"([A-Z_]+)"/g)) {
    assert.ok(GRAPH_CODES.has(match[1]), `${match[1]} is proved by the graph but not declared graph-scope`);
  }
});

test("every parent rule the checker holds is the one its skill teaches", () => {
  const taught = {
    story: "02-user-stories",
    task: "10-task",
    spike: "05-spike",
  };
  for (const [type, rule] of Object.entries(PARENT_RULES)) {
    const relations = fs.readFileSync(path.join(skills, taught[type], "references/relations.md"), "utf8");
    const row = relations.split("\n").find((line) => line.startsWith(`| \`${rule.field}\``));
    assert.ok(row, `${taught[type]} never names ${rule.field}`);
    for (const allowed of rule.allowed) {
      // The prose names the type in the singular or the plural; the stem carries both.
      const stem = allowed[0].toUpperCase() + allowed.slice(1).replace(/y$/, "");
      assert.match(row, new RegExp(stem), `${taught[type]} omits ${allowed} from ${rule.field}`);
    }
    assert.ok(
      FOLDERS[type] && !rule.allowed.some((allowed) => !FOLDERS[allowed]),
      `${type} points at a type the checker does not know`,
    );
  }
});

test("a cancelled Spike owes its reason, not an outcome it never reached", () => {
  const root = project({
    "aidd_docs/backlog/spikes/s.md": "---\ntype: spike\nstatus: cancelled\n---\n\n# S\n\n## Cancellation\n\nQuestion dropped.\n",
  });
  assert.deepEqual(codes(inspectBacklog(root)), []);
});

test("the write-time hook stays silent on a half-applied change set", () => {
  const root = project({
    "aidd_docs/backlog/epics/epic.md": epic(),
    "aidd_docs/backlog/stories/a.md": story("ready", "parent: aidd_docs/backlog/epics/epic.md\norder: 2\n"),
    "aidd_docs/backlog/stories/b.md": story("ready", "parent: aidd_docs/backlog/epics/epic.md\norder: 2\n"),
    "aidd_docs/backlog/stories/c.md": story("ready", "parent: aidd_docs/backlog/epics/absent.md\n"),
  });
  assert.deepEqual(codes(inspectBacklog(root)).sort(), ["DUPLICATE_ORDER", "MISSING_TARGET"]);

  const hook = spawnSync(process.execPath, [script, "--hook"], {
    cwd: root,
    input: JSON.stringify({ cwd: root, tool_input: { file_path: "aidd_docs/backlog/stories/a.md" } }),
    encoding: "utf8",
  });
  assert.equal(hook.status, 0);
  assert.equal(hook.stderr, "");

  const cli = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /DUPLICATE_ORDER/);
  assert.match(cli.stderr, /MISSING_TARGET/);
});

test("hook feeds related invalid writes back after the tool ran", () => {
  const root = project({ "aidd_docs/backlog/stories/story.md": story("open") });
  const result = spawnSync(process.execPath, [script, "--hook"], {
    cwd: root,
    input: JSON.stringify({ cwd: root, tool_input: { file_path: "aidd_docs/backlog/stories/story.md" } }),
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /INVALID_STATUS aidd_docs\/backlog\/stories\/story\.md/);
});

test("a write is judged before it happens, where a before still exists", () => {
  const root = project({
    "aidd_docs/backlog/stories/s.md": story("proposed"),
  });
  const file = path.join(root, "aidd_docs/backlog/stories/s.md");
  const edit = (from, to) => ({ tool_input: { file_path: file, old_string: from, new_string: to } });

  assert.deepEqual(
    inspectChange(edit("status: proposed", "status: done")).map((item) => [item.code, item.scope]),
    [["ILLEGAL_TRANSITION", "change"]],
  );
  assert.deepEqual(inspectChange(edit("status: proposed", "status: ready")), []);
  assert.deepEqual(
    inspectChange({ tool_input: { file_path: file, content: story("cancelled") } }),
    [],
  );
});

test("a patch is judged on the status it sets", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const file = path.join(root, "aidd_docs/backlog/stories/s.md");
  const patch = (status) => ({
    tool_input: { patch: `*** Update File: ${file}\n@@\n-status: proposed\n+status: ${status}\n` },
  });
  assert.deepEqual(inspectChange(patch("done")).map((item) => item.code), ["ILLEGAL_TRANSITION"]);
  assert.deepEqual(inspectChange(patch("ready")), []);
});

test("complete Add and Update patches reconstruct their proposed content", () => {
  const added = "{\n  \"phase\": \"proposed\"\n}";
  const addPatch = `*** Begin Patch\n*** Add File: tx.json\n${added.split("\n").map((line) => `+${line}`).join("\n")}\n*** End Patch`;
  assert.equal(patchedContent(addPatch, null), added);

  const applied = added.replace("proposed", "applied");
  const updatePatch = `*** Begin Patch\n*** Update File: tx.json\n@@\n${added.split("\n").map((line) => `-${line}`).join("\n")}\n${applied.split("\n").map((line) => `+${line}`).join("\n")}\n*** End Patch`;
  assert.equal(patchedContent(updatePatch, `${added}\n`), `${applied}\n`);
});

test("a field the project adds survives into the read model", () => {
  const root = project({
    "aidd_docs/backlog/stories/s.md": story("ready", "milestone: M1\norder: 2\n"),
  });
  const [entry] = inspectBacklog(root).artifacts;
  assert.equal(entry.milestone, "M1");
  assert.equal(entry.order, 2);
});

test("an artifact cannot be born finished", () => {
  const root = project({});
  const born = (status) => ({
    tool_input: {
      file_path: path.join(root, "aidd_docs/backlog/tasks/t.md"),
      content: task(status, "", "## Completion Evidence\n\n- shipped\n"),
    },
  });
  assert.deepEqual(
    inspectChange(born("done")).map((item) => [item.code, item.scope]),
    [["TERMINAL_AT_CREATION", "change"]],
  );
  assert.deepEqual(inspectChange(born("cancelled")).map((item) => item.code), ["TERMINAL_AT_CREATION"]);
  assert.deepEqual(inspectChange(born("ready")), []);
  assert.deepEqual(inspectChange(born("proposed")), []);
});

test("the pre-write hook stays silent on anything it cannot judge", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const file = path.join(root, "aidd_docs/backlog/stories/s.md");
  const cases = [
    { tool_input: { file_path: path.join(root, "src/app.ts"), content: "x" } },
    { tool_input: { file_path: path.join(root, "aidd_docs/backlog/stories/absent.md"), content: story("ready") } },
    { tool_input: { file_path: file, old_string: "never there", new_string: "x" } },
    { tool_input: { file_path: file, content: "no frontmatter" } },
    {},
  ];
  for (const payload of cases) assert.deepEqual(inspectChange(payload), [], JSON.stringify(payload));
});

test("the portable observer blocks an illegal transition before the write", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const file = path.join(root, "aidd_docs/backlog/stories/s.md");
  const result = runHook(observeHook, {
    hookEventName: "preToolUse",
    sessionId: "cursor-transition",
    cwd: root,
    toolName: "Write",
    toolArgs: { filePath: file, content: story("done") },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /ILLEGAL_TRANSITION/);
  assert.equal(result.stderr.match(/ILLEGAL_TRANSITION/g).length, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    permission: "deny",
    agent_message: result.stderr.trim(),
    permissionDecision: "deny",
    permissionDecisionReason: result.stderr.trim(),
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: result.stderr.trim(),
    },
  });
  assert.equal(fs.readFileSync(file, "utf8"), story("proposed"));
});

test("the portable observer parses Copilot stringified tool arguments", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const file = path.join(root, "aidd_docs/backlog/stories/s.md");
  const result = runHook(observeHook, {
    eventName: "preToolUse",
    sessionId: "copilot-string-input",
    workspaceRoot: root,
    toolName: "edit",
    toolArgs: JSON.stringify({ filePath: file, content: story("done") }),
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /ILLEGAL_TRANSITION/);
});

test("the portable observer checks every target in a batched write", () => {
  const root = project({
    "aidd_docs/backlog/stories/first.md": story("proposed"),
    "aidd_docs/backlog/stories/second.md": story("proposed"),
  });
  const result = runHook(observeHook, {
    hookEventName: "preToolUse",
    sessionId: "cursor-batch",
    cwd: root,
    toolName: "Write",
    toolArgs: {
      changes: [
        {
          filePath: path.join(root, "aidd_docs/backlog/stories/first.md"),
          content: story("ready"),
        },
        {
          filePath: path.join(root, "aidd_docs/backlog/stories/second.md"),
          content: story("done"),
        },
      ],
    },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /second\.md/);
  assert.match(result.stderr, /ILLEGAL_TRANSITION/);
});

test("reading a backlog path does not open a transaction", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const session = `read-${path.basename(root)}`;
  assert.equal(
    runHook(observeHook, {
      hook_event_name: "PreToolUse",
      session_id: session,
      cwd: root,
      tool_name: "Read",
      tool_input: { file_path: path.join(root, "aidd_docs/backlog/stories/s.md") },
    }).status,
    0,
  );
  assert.equal(
    runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root }).stderr,
    "",
  );
});

test("a graph problem one write cannot prove waits for the end of the turn", () => {
  const root = project({
    "aidd_docs/backlog/epics/e.md": epic(),
    "aidd_docs/backlog/stories/s.md": story(
      "ready",
      "parent: aidd_docs/backlog/epics/e.md\n",
    ),
  });
  const file = path.join(root, "aidd_docs/backlog/stories/s.md");
  const session = `transaction-${path.basename(root)}`;
  const invalid = story("ready", "parent: aidd_docs/backlog/epics/missing.md\n");
  const input = {
    file_path: file,
    old_string: fs.readFileSync(file, "utf8"),
    new_string: invalid,
  };

  const allowed = runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Edit",
    tool_input: input,
  });
  assert.equal(allowed.status, 0, allowed.stderr);
  fs.writeFileSync(file, invalid);
  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(stopped.status, 2);
  assert.match(stopped.stderr, /MISSING_TARGET/);
});

test("Stop is silent when no backlog mutation was observed", () => {
  const root = project({ "aidd_docs/backlog/epics/e.md": epic() });
  const result = runHook(verifyHook, {
    hook_event_name: "Stop",
    session_id: `no-change-${path.basename(root)}`,
    cwd: root,
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
});

test("Stop judges a transition even when the mutating tool was opaque", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const file = path.join(root, "aidd_docs/backlog/stories/s.md");
  const session = `opaque-${path.basename(root)}`;
  const command = `replace status in ${file}`;
  const event = (name) => ({
    hook_event_name: name,
    session_id: session,
    cwd: root,
    tool_name: "Bash",
    tool_input: { command },
  });
  assert.equal(runHook(observeHook, event("PreToolUse")).status, 0);
  fs.writeFileSync(file, story("done"));
  assert.equal(runHook(observeHook, event("PostToolUse")).status, 0);
  const result = runHook(verifyHook, {
    hook_event_name: "Stop",
    session_id: session,
    cwd: root,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /ILLEGAL_TRANSITION/);
});

test("deleting an artifact is refused at the end of the turn", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const file = path.join(root, "aidd_docs/backlog/stories/s.md");
  const session = `delete-${path.basename(root)}`;
  const opened = runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Delete",
    tool_input: { file_path: file },
  });
  assert.equal(opened.status, 0, opened.stderr);
  fs.rmSync(file);
  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(stopped.status, 2);
  assert.match(stopped.stderr, /ARTIFACT_DELETED/);
});

test("Stop rejects deleting an artifact whose frontmatter was already invalid", () => {
  const root = project({ "aidd_docs/backlog/stories/invalid.md": "# Invalid\n" });
  const file = path.join(root, "aidd_docs/backlog/stories/invalid.md");
  const session = `delete-invalid-${path.basename(root)}`;
  const event = (name) => ({
    hook_event_name: name,
    session_id: session,
    cwd: root,
    tool_name: "Bash",
    tool_input: { command: `delete ${file}` },
  });
  assert.equal(runHook(observeHook, event("PreToolUse")).status, 0);
  fs.unlinkSync(file);
  const result = runHook(verifyHook, {
    hook_event_name: "Stop",
    session_id: session,
    cwd: root,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /ARTIFACT_DELETED/);
});

test("Stop blocks an unreadable transaction journal", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const event = {
    hook_event_name: "Stop",
    session_id: `corrupt-${path.basename(root)}`,
    cwd: root,
  };
  const journal = fileFor({ cwd: root, sessionId: event.session_id });
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  fs.writeFileSync(journal, "not json\n");
  const result = runHook(verifyHook, event);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unreadable/);
  assert.equal(fs.existsSync(journal), false);
});

test("Stop does not make unrelated historical findings block every change", () => {
  const root = project({
    "aidd_docs/backlog/stories/s.md": story(
      "proposed",
      "parent: aidd_docs/backlog/epics/missing.md\n",
    ),
  });
  const file = path.join(root, "aidd_docs/backlog/stories/s.md");
  const session = `historical-${path.basename(root)}`;
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace("# Story", "# Story clarified");
  const contractFile = path.join(root, ".aidd/cache/backlog-transactions/historical.json");
  const priorArtifact = artifact("story", "story", "proposed", {
    id: "aidd_docs/backlog/stories/s.md",
    relations: { parent: "aidd_docs/backlog/epics/missing.md" },
    fields: { title: "Story" },
  });
  const nextArtifact = {
    ...priorArtifact,
    fields: { title: "Story clarified" },
    verified: true,
  };
  const contract = {
    version: 1,
    transaction: "historical",
    phase: "proposed",
    before: [priorArtifact],
    proposed: [nextArtifact],
  };
  const contractEvent = (value) => ({
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: contractFile, content: JSON.stringify(value) },
  });
  assert.equal(runHook(observeHook, contractEvent(contract)).status, 0);
  fs.mkdirSync(path.dirname(contractFile), { recursive: true });
  fs.writeFileSync(contractFile, JSON.stringify(contract));
  const input = { file_path: file, old_string: before, new_string: after };
  const event = (name) => ({
    hook_event_name: name,
    session_id: session,
    cwd: root,
    tool_name: "Edit",
    tool_input: input,
  });
  assert.equal(runHook(observeHook, event("PreToolUse")).status, 0);
  fs.writeFileSync(file, after);
  assert.equal(runHook(observeHook, event("PostToolUse")).status, 0);
  contract.phase = "applied";
  contract.actual = [nextArtifact];
  assert.equal(runHook(observeHook, contractEvent(contract)).status, 0);
  fs.writeFileSync(contractFile, JSON.stringify(contract));
  assert.equal(
    runHook(verifyHook, {
      hook_event_name: "Stop",
      session_id: session,
      cwd: root,
    }).status,
    0,
  );
});

test("canonical transaction is support-neutral and preserves project fields", () => {
  assert.deepEqual(validateCanonicalTransaction(transaction()).diagnostics, []);
  assert.deepEqual(validateCanonicalTransaction(transaction("applied"), "applied").diagnostics, []);
});

test("canonical Epic goal remains an external stable reference", () => {
  const prior = artifact("epic", "epic", "proposed", {
    relations: { goal: "aidd_docs/goals/growth.md" },
  });
  const value = {
    version: 1,
    transaction: "goal",
    phase: "proposed",
    before: [prior],
    proposed: [prior],
  };
  assert.deepEqual(validateCanonicalTransaction(value).diagnostics, []);
});

test("canonical transaction includes relation targets without forcing a parent update", () => {
  const value = transaction();
  assert.equal(value.proposed[0].verified, false);
  assert.deepEqual(validateCanonicalTransaction(value).diagnostics, []);

  value.proposed = value.proposed.slice(1);
  assert.ok(codes(validateCanonicalTransaction(value)).includes("INCOMPLETE_SCOPE"));
});

test("canonical transaction rejects invalid relations and lifecycle changes", () => {
  const wrongParent = transaction();
  wrongParent.proposed[0] = artifact("epic-1", "task", "ready");
  assert.ok(codes(validateCanonicalTransaction(wrongParent)).includes("INVALID_PARENT_TYPE"));

  const transition = transaction();
  transition.before = [artifact("story-1", "story", "proposed")];
  transition.proposed = [artifact("story-1", "story", "done", { verified: true })];
  assert.deepEqual(codes(validateCanonicalTransaction(transition)), ["ILLEGAL_TRANSITION"]);

  const terminalParent = transaction();
  terminalParent.before = [artifact("epic-1", "epic", "in-progress")];
  terminalParent.proposed[0] = artifact("epic-1", "epic", "done", { verified: true });
  assert.ok(codes(validateCanonicalTransaction(terminalParent)).includes("LIVE_CHILD"));
});

test("canonical transaction rejects unchecked or divergent readback", () => {
  const unchecked = transaction();
  unchecked.proposed[1].verified = false;
  assert.deepEqual(codes(validateCanonicalTransaction(unchecked)), ["UNVERIFIED_ARTIFACT"]);

  const divergent = transaction("applied");
  divergent.actual[1].status = "ready";
  assert.ok(codes(validateCanonicalTransaction(divergent, "applied")).includes("ACTUAL_MISMATCH"));

  const unidentified = transaction("applied");
  delete unidentified.actual[1].id;
  assert.ok(codes(validateCanonicalTransaction(unidentified, "applied")).includes("MISSING_IDENTITY"));
});

test("canonical transaction rejects malformed and unknown fields", () => {
  const value = transaction();
  value.implementation = "jira";
  value.proposed[1].owner = "agent";
  value.proposed[1].relations.parent = 42;
  value.proposed[1].verified = "yes";
  const result = codes(validateCanonicalTransaction(value));
  assert.ok(result.includes("UNKNOWN_FIELD"));
  assert.ok(result.includes("INVALID_RELATION"));
  assert.ok(result.includes("INVALID_VERIFICATION"));
});

test("canonical transaction rejects duplicate order, mirrored links, and cycles", () => {
  const value = {
    version: 1,
    transaction: "tx-graph",
    phase: "proposed",
    before: [],
    proposed: [
      artifact("a", "story", "proposed", {
        id: undefined,
        order: 1,
        relations: { parent: "epic", related_to: "b", depends_on: "b" },
        verified: true,
      }),
      artifact("b", "story", "proposed", {
        id: undefined,
        order: 1,
        relations: { parent: "epic", related_to: "a", depends_on: "a" },
        verified: true,
      }),
      artifact("epic", "epic", "ready", { id: undefined, verified: true }),
    ],
  };
  const result = codes(validateCanonicalTransaction(value));
  assert.ok(result.includes("DUPLICATE_ORDER"));
  assert.ok(result.includes("MIRRORED_RELATION"));
  assert.ok(result.includes("RELATION_CYCLE"));
});

test("portable hooks validate an external support transaction end to end", () => {
  const root = project();
  const relative = ".aidd/cache/backlog-transactions/external.json";
  const target = path.join(root, relative);
  const session = `external-${path.basename(root)}`;
  const event = (content) => ({
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: target, content },
  });

  const proposed = `${JSON.stringify(transaction(), null, 2)}\n`;
  assert.equal(runHook(observeHook, event(proposed)).status, 0);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, proposed);

  const applied = `${JSON.stringify(transaction("applied"), null, 2)}\n`;
  assert.equal(runHook(observeHook, event(applied)).status, 0);
  fs.writeFileSync(target, applied);

  assert.equal(
    runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root }).status,
    0,
  );
  assert.equal(fs.existsSync(target), false);
});

test("parallel proposals retain every transaction path", async () => {
  const root = project();
  const session = `parallel-${path.basename(root)}`;
  const event = (name) => ({
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: {
      file_path: path.join(root, `.aidd/cache/backlog-transactions/${name}.json`),
      content: JSON.stringify({ ...transaction(), transaction: name }),
    },
  });
  const results = await Promise.all([
    runHookAsync(observeHook, event("first")),
    runHookAsync(observeHook, event("second")),
  ]);
  assert.deepEqual(results.map((result) => result.status), [0, 0]);
  assert.deepEqual([...readJournal({ cwd: root, sessionId: session }).contractPaths].sort(), [
    ".aidd/cache/backlog-transactions/first.json",
    ".aidd/cache/backlog-transactions/second.json",
  ]);
  clearJournal({ cwd: root, sessionId: session });
});

test("portable hooks block invalid or incomplete external transactions", () => {
  const root = project();
  const target = path.join(root, ".aidd/cache/backlog-transactions/external.json");
  const session = `incomplete-${path.basename(root)}`;
  const value = transaction();
  value.proposed[1].relations.parent = "missing";
  const rejected = runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: target, content: JSON.stringify(value) },
  });
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /INCOMPLETE_SCOPE/);

  const proposed = transaction();
  const content = `${JSON.stringify(proposed)}\n`;
  const accepted = runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: target, content },
  });
  assert.equal(accepted.status, 0);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  const stopped = runHook(verifyHook, {
    hook_event_name: "Stop",
    session_id: session,
    cwd: root,
  });
  assert.equal(stopped.status, 0);
});

test("a proposal is withdrawn by finishing the turn", () => {
  const root = project();
  const target = path.join(root, ".aidd/cache/backlog-transactions/abandoned.json");
  const session = `withdrawn-${path.basename(root)}`;
  const staged = runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: target, content: JSON.stringify(transaction()) },
  });
  assert.equal(staged.status, 0);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(transaction()));

  const finished = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(finished.status, 0, finished.stderr);
});

test("a rejected transaction can be staged again until it verifies", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const target = path.join(root, ".aidd/cache/backlog-transactions/retry.json");
  const session = `retry-${path.basename(root)}`;
  const record = (extra = {}) => ({
    key: "s",
    id: `markdown:aidd_docs/backlog/stories/s.md`,
    type: "story",
    status: "proposed",
    verified: true,
    ...extra,
  });
  const write = (value) => runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: target, content: JSON.stringify(value) },
  });
  const stop = () => runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  const shape = (phase, extra) => ({
    version: 1,
    transaction: "retry-1",
    phase,
    before: [record()],
    proposed: [record(extra)],
    ...(phase === "applied" ? { actual: [record(extra)] } : {}),
  });

  assert.equal(write(shape("proposed", { order: 7 })).status, 0);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(shape("applied", { order: 7 })));
  const rejected = stop();
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /MARKDOWN_READBACK_MISMATCH/);

  assert.equal(write(shape("applied", {})).status, 0);
  fs.writeFileSync(target, JSON.stringify(shape("applied", {})));
  assert.equal(stop().status, 0);
  assert.equal(fs.existsSync(target), false);
});

test("a turn may walk an artifact through several statuses", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const file = path.join(root, "aidd_docs/backlog/stories/s.md");
  const session = `walked-${path.basename(root)}`;
  for (const status of ["ready", "in-progress"]) {
    const next = story(status);
    const step = runHook(observeHook, {
      hook_event_name: "PreToolUse",
      session_id: session,
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: file, content: next },
    });
    assert.equal(step.status, 0, `${status} refused: ${step.stderr}`);
    fs.writeFileSync(file, next);
  }
  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(stopped.status, 0, stopped.stderr);
});

test("a turn may create an artifact and carry it to done", () => {
  const root = project();
  const relative = "aidd_docs/backlog/tasks/t.md";
  const file = path.join(root, relative);
  const session = `carried-${path.basename(root)}`;
  const body = (status) => `---\ntype: task\nstatus: ${status}\n---\n\n# T\n\n## Outcome\n\nx\n\n## Scope\n\nx\n\n## Done When\n\nx\n\n## Completion Evidence\n\nx\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const status of ["proposed", "ready", "in-progress", "done"]) {
    const step = runHook(observeHook, {
      hook_event_name: "PreToolUse",
      session_id: session,
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: file, content: body(status) },
    });
    assert.equal(step.status, 0, `${status} refused: ${step.stderr}`);
    fs.writeFileSync(file, body(status));
  }
  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(stopped.status, 0, stopped.stderr);
});

test("a turn that skips a status is still refused at the end", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const file = path.join(root, "aidd_docs/backlog/stories/s.md");
  const session = `skipped-${path.basename(root)}`;
  const command = `replace status in ${file}`;
  assert.equal(runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Bash",
    tool_input: { command },
  }).status, 0);
  fs.writeFileSync(file, story("done"));
  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(stopped.status, 2);
  assert.match(stopped.stderr, /ILLEGAL_TRANSITION/);
});

test("the backlog belongs to the project, not to the directory a tool runs from", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  assert.equal(inspectBacklog(path.join(root, "aidd_docs")).artifacts.length, 1);
  assert.equal(inspectBacklog(path.join(root, "aidd_docs/backlog/stories")).artifacts.length, 1);

  // A tool reporting a subdirectory must not read an empty graph and call it healthy.
  const nested = path.join(root, "aidd_docs");
  const session = `nested-${path.basename(root)}`;
  assert.equal(runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: nested,
    tool_name: "Bash",
    tool_input: { command: "rm aidd_docs/backlog/stories/s.md" },
  }).status, 0);
  fs.rmSync(path.join(root, "aidd_docs/backlog/stories/s.md"));
  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: nested });
  assert.equal(stopped.status, 2);
  assert.match(stopped.stderr, /ARTIFACT_DELETED/);
});

test("renaming an artifact is a move, not a deletion", () => {
  const root = project({ "aidd_docs/backlog/tasks/tsak.md": task("proposed") });
  const session = `moved-${path.basename(root)}`;
  const from = path.join(root, "aidd_docs/backlog/tasks/tsak.md");
  const to = path.join(root, "aidd_docs/backlog/tasks/task.md");
  const content = fs.readFileSync(from, "utf8");
  for (const input of [{ file_path: to, content }, { file_path: from }]) {
    assert.equal(runHook(observeHook, {
      hook_event_name: "PreToolUse",
      session_id: session,
      cwd: root,
      tool_name: "Write",
      tool_input: input,
    }).status, 0);
  }
  fs.renameSync(from, to);
  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(stopped.status, 0, stopped.stderr);
});

test("a coherent Markdown write needs no transaction", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const file = path.join(root, "aidd_docs/backlog/stories/s.md");
  const session = `plain-${path.basename(root)}`;
  const after = story("proposed").replace("# Story", "# Story clarified");
  const written = runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: file, content: after },
  });
  assert.equal(written.status, 0, written.stderr);
  fs.writeFileSync(file, after);
  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(stopped.status, 0, stopped.stderr);
});

test("observer rejects a proposal and backlog mutation in one tool call", () => {
  const root = project();
  const contract = JSON.stringify(transaction(), null, 2).split("\n").map((line) => `+${line}`).join("\n");
  const content = story("proposed").split("\n").map((line) => `+${line}`).join("\n");
  const patch = `*** Begin Patch\n*** Add File: .aidd/cache/backlog-transactions/mixed.json\n${contract}\n*** Add File: aidd_docs/backlog/stories/s.md\n${content}\n*** End Patch`;
  const result = runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: `mixed-${path.basename(root)}`,
    cwd: root,
    tool_name: "apply_patch",
    tool_input: { command: patch },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /MIXED_TRANSACTION_WRITE/);
});

test("observer requires proposal first and keeps it immutable", () => {
  const root = project();
  const target = path.join(root, ".aidd/cache/backlog-transactions/immutable.json");
  const event = (value) => ({
    hook_event_name: "PreToolUse",
    session_id: `immutable-${path.basename(root)}`,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: target, content: JSON.stringify(value) },
  });

  assert.match(runHook(observeHook, event(transaction("applied"))).stderr, /MISSING_PROPOSAL/);
  const proposed = transaction();
  assert.equal(runHook(observeHook, event(proposed)).status, 0);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(proposed));
  const changed = transaction("applied");
  changed.proposed[1].fields.milestone = "M2";
  changed.actual[1].fields.milestone = "M2";
  assert.match(runHook(observeHook, event(changed)).stderr, /PROPOSAL_CHANGED/);
});

test("observer closes an applied transaction", () => {
  const root = project();
  const target = path.join(root, ".aidd/cache/backlog-transactions/closed.json");
  const event = (value) => ({
    hook_event_name: "PreToolUse",
    session_id: `closed-${path.basename(root)}`,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: target, content: JSON.stringify(value) },
  });
  const proposed = transaction();
  assert.equal(runHook(observeHook, event(proposed)).status, 0);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(proposed));
  const applied = transaction("applied");
  assert.equal(runHook(observeHook, event(applied)).status, 0);
  fs.writeFileSync(target, JSON.stringify(applied));
  applied.actual[1].fields.milestone = "M2";
  assert.match(runHook(observeHook, event(applied)).stderr, /TRANSACTION_CLOSED/);
});

test("Stop compares canonical Markdown state, not path membership alone", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const storyId = "aidd_docs/backlog/stories/s.md";
  const target = path.join(root, ".aidd/cache/backlog-transactions/mismatch.json");
  const session = `mismatch-${path.basename(root)}`;
  const record = artifact("story", "story", "proposed", { id: `markdown:${storyId}` });
  const contract = {
    version: 1,
    transaction: "mismatch",
    phase: "proposed",
    before: [record],
    proposed: [record],
  };
  const contractEvent = (value) => ({
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: target, content: JSON.stringify(value) },
  });
  assert.equal(runHook(observeHook, contractEvent(contract)).status, 0);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(contract));

  const file = path.join(root, storyId);
  assert.equal(runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: file, content: story("ready") },
  }).status, 0);
  fs.writeFileSync(file, story("ready"));
  contract.phase = "applied";
  contract.actual = [record];
  assert.equal(runHook(observeHook, contractEvent(contract)).status, 0);
  fs.writeFileSync(target, JSON.stringify(contract));
  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(stopped.status, 2);
  assert.match(stopped.stderr, /MARKDOWN_READBACK_MISMATCH/);
});

test("Stop rejects a canonical field missing from Markdown", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const storyId = "aidd_docs/backlog/stories/s.md";
  const target = path.join(root, ".aidd/cache/backlog-transactions/field.json");
  const session = `field-${path.basename(root)}`;
  const prior = artifact("story", "story", "proposed", {
    id: storyId,
    fields: { title: "Story" },
  });
  const next = {
    ...prior,
    fields: { title: "Story clarified", milestone: "M1" },
    verified: true,
  };
  const contract = {
    version: 1,
    transaction: "field",
    phase: "proposed",
    before: [prior],
    proposed: [next],
  };
  const event = (value) => ({
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: target, content: JSON.stringify(value) },
  });
  assert.equal(runHook(observeHook, event(contract)).status, 0);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(contract));
  const file = path.join(root, storyId);
  const content = story("proposed").replace("# Story", "# Story clarified");
  assert.equal(runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: file, content },
  }).status, 0);
  fs.writeFileSync(file, content);
  contract.phase = "applied";
  contract.actual = [next];
  assert.equal(runHook(observeHook, event(contract)).status, 0);
  fs.writeFileSync(target, JSON.stringify(contract));
  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(stopped.status, 2);
  assert.match(stopped.stderr, /MARKDOWN_READBACK_MISMATCH/);
});

test("documented transitions match the checker", () => {
  for (const [type, skill] of Object.entries(ARTIFACT_SKILL)) {
    const lifecycle = fs.readFileSync(path.join(skills, skill, "references/lifecycle.md"), "utf8");
    const rows = lifecycle
      .split("\n")
      .filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line))
      .slice(1);
    const documented = Object.fromEntries(
      rows.map((row) => {
        const cells = row.split("|");
        return [backticked(cells[1])[0], backticked(cells[3])];
      }),
    );
    assert.deepEqual(documented, TRANSITIONS[type], `${skill} lifecycle diverges from the checker`);
  }
});

test("documented statuses match the checker", () => {
  for (const [type, skill] of Object.entries(ARTIFACT_SKILL)) {
    const lifecycle = fs.readFileSync(path.join(skills, skill, "references/lifecycle.md"), "utf8");
    assert.deepEqual(
      firstColumn(lifecycle).flatMap(backticked).sort(),
      [...STATUSES[type]].sort(),
      `${skill} lifecycle diverges from the checker`,
    );
  }
});

test("a section holding only a placeholder is empty, bullet or not", () => {
  const root = project({
    "aidd_docs/backlog/stories/placeholder.md":
      "---\ntype: story\nstatus: ready\n---\n\n# Story: p\n\n## Acceptance\n\n- <observable condition>\n",
    "aidd_docs/backlog/epics/placeholder.md":
      "---\ntype: epic\nstatus: ready\n---\n\n# Epic: p\n\n## Success Evidence\n\n<the signal>\n",
    "aidd_docs/backlog/stories/filled.md": story("ready"),
  });
  assert.deepEqual(codes(inspectBacklog(root)).sort(), [
    "MISSING_ACCEPTANCE",
    "MISSING_SUCCESS_EVIDENCE",
    "PLACEHOLDER",
    "PLACEHOLDER",
  ]);
});

test("each template ships the sections the checker will require", () => {
  for (const [type, skill] of Object.entries(ARTIFACT_SKILL)) {
    const assets = path.join(skills, skill, "assets");
    const [name] = fs.readdirSync(assets).filter((file) => file.endsWith("-template.md"));
    const template = fs.readFileSync(path.join(assets, name), "utf8");
    const required = REQUIRED_SECTIONS.filter((rule) => rule.type === type).flatMap((rule) => rule.sections);
    for (const section of new Set(required)) {
      assert.ok(template.includes(`## ${section}`), `${skill}/${name} is missing "## ${section}"`);
    }
  }
});

test("each artifact documents the folder the checker expects", () => {
  for (const [type, skill] of Object.entries(ARTIFACT_SKILL)) {
    const persistence = fs.readFileSync(path.join(skills, skill, "references/persistence.md"), "utf8");
    const documented = [...persistence.matchAll(/aidd_docs\/backlog\/([a-z]+)\//g)].map((m) => m[1]);
    assert.deepEqual([...new Set(documented)], [FOLDERS[type]], `${skill} persistence diverges`);
  }
});

test("each artifact documents its own fields, and the checker agrees", () => {
  const owned = new Map();
  const inverse = new Map();
  for (const [type, skill] of Object.entries(ARTIFACT_SKILL)) {
    const relations = fs.readFileSync(path.join(skills, skill, "references/relations.md"), "utf8");
    owned.set(type, firstColumn(relations).flatMap(backticked));
    inverse.set(
      type,
      backticked(relations.split("\n").find((line) => line.startsWith("Inverse links"))),
    );
  }
  const universe = [...new Set([...owned.values()].flat())];
  for (const [type, forbidden] of Object.entries(FORBIDDEN)) {
    const documented = [
      ...inverse.get(type),
      ...universe.filter((field) => !owned.get(type).includes(field)),
    ];
    assert.deepEqual(documented.sort(), [...forbidden].sort(), `${type} ownership diverges`);
  }
});

test("every direct PM writer reports the same compact change receipt", () => {
  for (const relative of WRITE_ACTIONS) {
    const content = fs.readFileSync(path.join(skills, relative), "utf8");
    assert.match(content, /stable identit/i, relative);
    assert.match(content, /`before -> after`/, relative);
    assert.match(content, /affected relations/i, relative);
    assert.match(content, /verification result/i, relative);
    assert.match(content, /no persisted change occurred/i, relative);
  }
});

test("every refusal the canonical transaction can state is reachable", () => {
  const base = () => ({
    version: 1,
    transaction: "tx",
    phase: "proposed",
    before: [{ key: "epic-1", id: "markdown:aidd_docs/backlog/epics/e.md", type: "epic", status: "ready", verified: true }],
    proposed: [
      { key: "epic-1", id: "markdown:aidd_docs/backlog/epics/e.md", type: "epic", status: "ready", verified: true },
      { key: "story-1", id: "markdown:aidd_docs/backlog/stories/s.md", type: "story", status: "proposed", relations: { parent: ["epic-1"] }, verified: true },
    ],
  });
  const refusals = [
    ["INVALID_TRANSACTION", () => "text"],
    ["INVALID_VERSION", (value) => ({ ...value, version: 2 })],
    ["MISSING_TRANSACTION", (value) => ({ ...value, transaction: " " })],
    ["INVALID_PHASE", (value) => ({ ...value, phase: "sent" })],
    ["UNKNOWN_FIELD", (value) => ({ ...value, note: "x" })],
    ["INVALID_SNAPSHOT", (value) => ({ ...value, before: {} })],
    ["INVALID_ARTIFACT", (value) => ({ ...value, proposed: ["story"] })],
    ["MISSING_KEY", (value) => ({ ...value, proposed: [{ type: "story", status: "proposed" }] })],
    ["INVALID_IDENTITY", (value) => ({ ...value, proposed: [{ ...value.proposed[1], id: 7 }] })],
    ["INVALID_FIELDS", (value) => ({ ...value, proposed: [{ ...value.proposed[1], fields: [] }] })],
    ["INVALID_VERIFICATION", (value) => ({ ...value, proposed: [{ ...value.proposed[1], verified: "yes" }] })],
    ["INVALID_RELATIONS", (value) => ({ ...value, proposed: [{ ...value.proposed[1], relations: [] }] })],
    ["UNKNOWN_RELATION", (value) => ({ ...value, proposed: [{ ...value.proposed[1], relations: { blocks: ["epic-1"] } }] })],
    ["DUPLICATE_KEY", (value) => ({ ...value, proposed: [value.proposed[1], value.proposed[1]] })],
    ["DUPLICATE_IDENTITY", (value) => ({
      ...value,
      proposed: [value.proposed[1], { ...value.proposed[1], key: "story-2", id: "aidd_docs/backlog/stories/s.md" }],
    })],
    ["UNKNOWN_TYPE", (value) => ({ ...value, proposed: [{ ...value.proposed[1], type: "milestone" }] })],
    ["UNKNOWN_STATUS", (value) => ({ ...value, proposed: [{ ...value.proposed[1], status: "started" }] })],
    ["INVALID_ORDER", (value) => ({ ...value, proposed: [{ ...value.proposed[1], order: 0 }] })],
    ["INVALID_RELATION_OWNER", (value) => ({ ...value, proposed: [{ ...value.proposed[0], relations: { parent: ["story-1"] } }, value.proposed[1]] })],
    ["MISSING_IDENTITY", (value) => ({ ...value, before: [{ ...value.before[0], id: undefined }] })],
    ["ARTIFACT_DELETED", (value) => ({ ...value, proposed: [value.proposed[1]] })],
    ["TYPE_CHANGED", (value) => ({ ...value, proposed: [{ ...value.proposed[0], type: "story" }, value.proposed[1]] })],
    ["IDENTITY_CHANGED", (value) => ({ ...value, proposed: [{ ...value.proposed[0], id: "markdown:aidd_docs/backlog/epics/other.md" }, value.proposed[1]] })],
    ["UNVERIFIED_ARTIFACT", (value) => ({ ...value, proposed: [value.proposed[0], { ...value.proposed[1], verified: false }] })],
    ["TERMINAL_AT_CREATION", (value) => ({ ...value, proposed: [value.proposed[0], { ...value.proposed[1], status: "done" }] })],
    ["ILLEGAL_TRANSITION", (value) => ({ ...value, proposed: [{ ...value.proposed[0], status: "done" }, value.proposed[1]] })],
    ["MISSING_ACTUAL", (value) => ({ ...value, phase: "applied", actual: [value.proposed[0]] })],
    ["UNEXPECTED_ACTUAL", (value) => ({
      ...value,
      phase: "applied",
      actual: [...value.proposed, { key: "extra", id: "markdown:aidd_docs/backlog/tasks/t.md", type: "task", status: "proposed", verified: true }],
    })],
    ["ACTUAL_MISMATCH", (value) => ({ ...value, phase: "applied", actual: [value.proposed[0], { ...value.proposed[1], status: "ready" }] })],
    ["UNVERIFIED_ACTUAL", (value) => ({ ...value, phase: "applied", actual: [value.proposed[0], { ...value.proposed[1], verified: false }] })],
  ];
  for (const [code, mutate] of refusals) {
    const result = validateCanonicalTransaction(mutate(base()));
    assert.ok(result.diagnostics.some((item) => item.code === code), `${code} unreachable: ${result.diagnostics.map((item) => item.code)}`);
  }
});

test("every refusal the observer can state about the staged file is reachable", () => {
  const root = project();
  const relative = ".aidd/cache/backlog-transactions/staged.json";
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const stage = (input) => runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: `observed-${path.basename(root)}`,
    cwd: root,
    tool_name: "Write",
    tool_input: input,
  });

  assert.match(stage({ file_path: target, content: "{" }).stderr, /INVALID_TRANSACTION_JSON/);
  assert.match(stage({ file_path: target, patch: "unparsable" }).stderr, /UNREADABLE_TRANSACTION/);
  assert.match(
    stage({ file_path: target, content: JSON.stringify(transaction("applied")) }).stderr,
    /MISSING_PROPOSAL/,
  );

  fs.writeFileSync(target, "{");
  assert.match(stage({ file_path: target, content: JSON.stringify(transaction()) }).stderr, /INVALID_PRIOR_TRANSACTION/);

  fs.writeFileSync(target, JSON.stringify(transaction("applied")));
  const regressed = stage({ file_path: target, content: JSON.stringify(transaction()) });
  assert.match(regressed.stderr, /PHASE_REGRESSION/);
  assert.match(regressed.stderr, /TRANSACTION_CLOSED/);

  const mixed = runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: `mixed-${path.basename(root)}`,
    cwd: root,
    tool_name: "Write",
    tool_input: { edits: [{ file_path: target, content: "{}" }, { file_path: path.join(root, "aidd_docs/backlog/stories/s.md"), content: "x" }] },
  });
  assert.match(mixed.stderr, /MIXED_TRANSACTION_WRITE/);
});

test("a staged proposal left unapplied at the end of a turn is not a finding", () => {
  const root = project();
  const relative = ".aidd/cache/backlog-transactions/pending.json";
  const session = `pending-${path.basename(root)}`;
  const accepted = runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: path.join(root, relative), content: JSON.stringify(transaction()) },
  });
  assert.equal(accepted.status, 0);
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), JSON.stringify(transaction()));
  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.doesNotMatch(stopped.stderr, /INCOMPLETE_TRANSACTION/);
});

test("a before that misreports the backlog is refused at verification", () => {
  const root = project({ "aidd_docs/backlog/stories/s.md": story("proposed") });
  const relative = ".aidd/cache/backlog-transactions/misreported.json";
  const session = `before-${path.basename(root)}`;
  const record = (extra = {}) => ({
    key: "s",
    id: "markdown:aidd_docs/backlog/stories/s.md",
    type: "story",
    status: "proposed",
    verified: true,
    ...extra,
  });
  const value = {
    version: 1,
    transaction: "misreported",
    phase: "applied",
    before: [record({ status: "ready" })],
    proposed: [record({ status: "ready" })],
    actual: [record({ status: "ready" })],
  };
  runHook(observeHook, {
    hook_event_name: "PreToolUse",
    session_id: session,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: path.join(root, relative), content: JSON.stringify({ ...value, phase: "proposed" }) },
  });
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), JSON.stringify(value));
  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(stopped.status, 2);
  assert.match(stopped.stderr, /MARKDOWN_BEFORE_MISMATCH/);
});

test("a second transaction may open on an artifact born in the same turn", () => {
  const root = project();
  const session = `sequenced-${path.basename(root)}`;
  const md = "aidd_docs/backlog/tasks/t.md";
  const record = (status) => ({
    key: "t",
    id: `markdown:${md}`,
    type: "task",
    status,
    fields: {},
    verified: true,
  });
  const stage = (relative, value) => {
    const result = runHook(observeHook, {
      hook_event_name: "PreToolUse",
      session_id: session,
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: path.join(root, relative), content: JSON.stringify(value) },
    });
    assert.equal(result.status, 0, `${relative} refused: ${result.stderr}`);
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), JSON.stringify(value));
  };
  const body = (status) => `---\ntype: task\nstatus: ${status}\n---\n\n# T\n\n## Outcome\n\nx\n\n## Scope\n\nx\n\n## Done When\n\nx\n`;

  const create = { version: 1, transaction: "create", phase: "proposed", before: [], proposed: [record("proposed")] };
  stage(".aidd/cache/backlog-transactions/create.json", create);
  fs.mkdirSync(path.join(root, "aidd_docs/backlog/tasks"), { recursive: true });
  fs.writeFileSync(path.join(root, md), body("proposed"));
  stage(".aidd/cache/backlog-transactions/create.json", { ...create, phase: "applied", actual: [record("proposed")] });

  const move = { version: 1, transaction: "move", phase: "proposed", before: [record("proposed")], proposed: [record("ready")] };
  stage(".aidd/cache/backlog-transactions/move.json", move);
  fs.writeFileSync(path.join(root, md), body("ready"));
  stage(".aidd/cache/backlog-transactions/move.json", { ...move, phase: "applied", actual: [record("ready")] });

  const stopped = runHook(verifyHook, { hook_event_name: "Stop", session_id: session, cwd: root });
  assert.equal(stopped.status, 0, stopped.stderr);
});

test("every backlog writer reads the graph back before it reports", () => {
  for (const skill of Object.values(ARTIFACT_SKILL)) {
    const actions = path.join(skills, skill, "actions");
    const writers = fs.readdirSync(actions)
      .map((name) => path.join(actions, name))
      .filter((file) => /After a write/i.test(fs.readFileSync(file, "utf8")));
    assert.ok(writers.length > 0, `${skill} has no writer`);
    for (const file of writers) {
      const content = fs.readFileSync(file, "utf8");
      assert.match(content, /\*\*Verify\.\*\* Read the affected graph back/, file);
      assert.doesNotMatch(content, /\*\*Stage\.\*\*/, file);
    }
  }
});

test("Backlog orchestration lives outside PM without addressing PM implementations", () => {
  const root = path.resolve(__dirname, "../..");
  const pmManifest = JSON.parse(
    fs.readFileSync(path.join(root, "plugins/aidd-pm/.claude-plugin/plugin.json"), "utf8"),
  );
  const orchestratorManifest = JSON.parse(
    fs.readFileSync(path.join(root, "plugins/aidd-orchestrator/.claude-plugin/plugin.json"), "utf8"),
  );
  assert.equal(pmManifest.skills.includes("./skills/00-backlog"), false);
  assert.equal(orchestratorManifest.skills.includes("./skills/02-backlog"), true);

  const backlog = path.join(root, "plugins/aidd-orchestrator/skills/02-backlog");
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name.endsWith(".md")) files.push(target);
    }
  };
  visit(backlog);
  const content = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(content, /aidd-pm:|plugins\/aidd-pm|skills\/0[2579]-|skills\/10-/);
});

test("no skill links outside itself", () => {
  const crossing = [];
  const check = (file, escape) => {
    if (escape.test(fs.readFileSync(path.join(skills, file), "utf8"))) crossing.push(file);
  };
  for (const skill of fs.readdirSync(skills)) {
    check(`${skill}/SKILL.md`, /\]\(\.\.\//);
    for (const group of ["actions", "references", "assets"]) {
      const dir = path.join(skills, skill, group);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) check(`${skill}/${group}/${name}`, /\]\(\.\.\/\.\.\//);
    }
  }
  assert.deepEqual(crossing, []);
});

test("every reference is reachable from its own skill", () => {
  const orphans = [];
  for (const skill of fs.readdirSync(skills)) {
    const dir = path.join(skills, skill, "references");
    if (!fs.existsSync(dir)) continue;
    const readers = [path.join(skills, skill, "SKILL.md")];
    const actions = path.join(skills, skill, "actions");
    if (fs.existsSync(actions)) {
      readers.push(...fs.readdirSync(actions).map((name) => path.join(actions, name)));
    }
    const reachable = readers.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    for (const name of fs.readdirSync(dir)) {
      if (!reachable.includes(`references/${name}`)) orphans.push(`${skill}/references/${name}`);
    }
  }
  assert.deepEqual(orphans, []);
});

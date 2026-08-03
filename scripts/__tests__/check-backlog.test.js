const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const script = path.resolve(__dirname, "../../plugins/aidd-pm/hooks/check-backlog.js");
const {
  FOLDERS,
  FORBIDDEN,
  GRAPH_CODES,
  REQUIRED_SECTIONS,
  STATUSES,
  TRANSITIONS,
  inspectBacklog,
  inspectChange,
  parseFrontmatter,
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
  for (const code of scopes.keys()) {
    assert.equal(scopes.get(code) === "graph", GRAPH_CODES.has(code));
  }
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

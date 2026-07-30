const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const script = path.resolve(__dirname, "../../plugins/aidd-pm/hooks/check-backlog.js");
const { inspectBacklog, parseFrontmatter, touchesBacklog } = require(script);

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
      "## Expected\n\nCorrect total.\n\n## Actual\n\nIncorrect total.\n\n## Impact\n\nCheckout fails.\n\n## Evidence\n\n- Report R-1\n",
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

test("backlog metadata in the body fails", () => {
  for (const line of ["**Status:** proposed", "- **Status:** proposed", "| **Status:** | proposed |", "## Status: proposed"]) {
    const root = project({
      "aidd_docs/backlog/epics/body-metadata.md": `${epic()}\n${line}\n`,
      "aidd_docs/backlog/epics/example.md":
        `${epic()}\n\`\`\`yaml\nstatus: proposed\n\`\`\`\n\n    status: proposed\n`,
    });
    assert.deepEqual(codes(inspectBacklog(root)), ["BODY_METADATA"]);
  }
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
    "aidd_docs/backlog/epics/epic.md": epic("ready", "children: [US-1]\norder: 1\n"),
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
    "aidd_docs/backlog/spikes/old.md": spike("cancelled"),
    "aidd_docs/backlog/spikes/new.md": spike("open", "supersedes: [aidd_docs/backlog/spikes/old.md]\n"),
  });
  assert.equal(inspectBacklog(terminal).valid, true);
});

test("mirrored related_to fails", () => {
  const root = project({
    "aidd_docs/backlog/stories/a.md": story("ready", "related_to: [aidd_docs/backlog/stories/b.md]\n"),
    "aidd_docs/backlog/stories/b.md": story("ready", "related_to: [aidd_docs/backlog/stories/a.md]\n"),
  });
  assert.ok(codes(inspectBacklog(root)).includes("MIRRORED_RELATION"));
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
      "## Expected\n\nA.\n\n## Actual\n\nB.\n\n## Impact\n\nC.\n\n## Evidence\n\nD.\n",
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
      "## Expected\n\nA.\n\n## Actual\n\nB.\n\n## Impact\n\nC.\n\n## Evidence\n\nD.\n\n## Verification\n\nVerified.\n",
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

// The task-declaration reader (declaredTaskPath, in hooks/lib/task-declared.cjs) was tested
// only against hand-written payloads until now (aidd-telemetry-journal.test.js's own
// readTaskPayload()), which proves the reader agrees with itself, not with anything a host
// actually sends - the weakest cell the six-questions audit named. This file replaces that
// with one real, live capture per host that can declare - Codex included, now that
// codex-cli is runnable in this environment, and OpenCode included, now that a genuine
// `opencode 1.14.20` capture (2026-08-31) settled the question a bounded measurement was run
// to answer: a completed tool part's own arguments do reach the plugin's `event` hook, and
// `hooks/opencode-plugin.js` joins one into a declaration the same way every other host's
// hook already does. See fixtures/README.md's "The task-declaration payloads" for exactly
// what each fixture rests on.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { declaredTaskPath } = require("../../plugins/aidd-telemetry/hooks/lib/task-declared.cjs");
const { detectHost } = require("../../plugins/aidd-telemetry/hooks/lib/host.cjs");

const fixturesDir = path.join(__dirname, "fixtures");

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

const TASK_RELATIVE_PATH = "aidd_docs/tasks/2026_08/2026_08_15_alpha/spec.md";

// One real captured payload per host that can declare, and the host it should resolve to -
// the fixture proves the reader against a genuine shape only if detectHost agrees it is one.
const TASK_DECLARED_FIXTURE_BY_HOST = {
  "claude-code": "claude-code-task-declared.json",
  copilot: "copilot-task-declared.json",
  cursor: "cursor-task-declared.json",
  codex: "codex-task-declared.json",
  opencode: "opencode-task-declared.json",
};

for (const [host, fixtureName] of Object.entries(TASK_DECLARED_FIXTURE_BY_HOST)) {
  test(`${host}'s own captured payload declares the task path it actually names`, () => {
    const payload = loadFixture(fixtureName);
    assert.equal(detectHost(payload), host);
    assert.equal(declaredTaskPath(payload), TASK_RELATIVE_PATH);
  });
}

// The negative: a captured payload naming a SKILL.md path, not a task path, declares
// nothing. No new capture needed - these four already exist, proven real elsewhere in this
// suite for the step dimension, and a path outside a task folder is exactly what they are.
const SKILL_FIXTURE_BY_HOST = {
  "claude-code": "claude-code-post-tool-use-skill.json",
  copilot: "copilot-post-tool-use-skill.json",
  codex: "codex-post-tool-use-skill-read.json",
  cursor: "cursor-post-tool-use-skill-read.json",
};

for (const [host, fixtureName] of Object.entries(SKILL_FIXTURE_BY_HOST)) {
  test(`${host}'s own captured SKILL.md read declares no task - a path outside a task folder is not a declaration`, () => {
    const payload = loadFixture(fixtureName);
    assert.equal(declaredTaskPath(payload), null);
  });
}

// Mutation proof, per host: declaredTaskPath reads only `payload.tool_input`, falling back
// to `payload.toolArgs` - renaming a key *inside* that object proves nothing, since
// firstTaskPathIn walks every string value regardless of its key. The shape drift that
// actually matters is the wrapper itself: if a host ever renamed tool_input (or Copilot's
// canonical toolArgs), the reader would stop finding anything in it - so that is the key
// this proof renames. All four captures here carry the path inside `tool_input`; none uses
// Copilot's canonical `toolArgs` string (see fixtures/README.md on why a live capture
// against this plugin's own hooks.json cannot land on that shape).
const WRAPPER_KEY = "tool_input";
const RENAMED_WRAPPER_CASE_BY_HOST = Object.keys(TASK_DECLARED_FIXTURE_BY_HOST);

for (const host of RENAMED_WRAPPER_CASE_BY_HOST) {
  test(`${host}: renaming the ${WRAPPER_KEY} wrapper the path lives in turns the declaration reader red`, () => {
    const payload = loadFixture(TASK_DECLARED_FIXTURE_BY_HOST[host]);
    assert.equal(declaredTaskPath(payload), TASK_RELATIVE_PATH, "sanity: the un-mutated fixture still declares");

    payload.arguments = payload[WRAPPER_KEY];
    delete payload[WRAPPER_KEY];

    assert.equal(declaredTaskPath(payload), null);
  });
}

// OpenCode declares a task now: a bounded, three-further-session measurement (opencode
// 1.14.20, 2026-08-31) found a completed tool part's own arguments do reach the plugin's
// `event` hook - see fixtures/README.md's "OpenCode's tool part" for what was run, what
// arrived, and what did not. hooks/opencode-plugin.js's `declaredTaskCallFor` joins one the
// same way every other host's hook already does, asserted above through
// TASK_DECLARED_FIXTURE_BY_HOST like every other host. cli/src/domain/tools/ai/opencode.ts's
// telemetryTaskAttributable flips to true for the same reason, and
// registry-conformance.unit.test.ts keeps it tied to the journal hook's own tool-used
// dispatch rather than typed in twice by hand.

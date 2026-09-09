// One real, live capture per host that can declare a task, rather than a hand-written payload
// - which would only prove the reader agrees with itself, never with anything a host sends.
// For OpenCode it is the call `opencode-plugin.js` builds from a genuinely captured event.
// See fixtures/README.md for exactly what each fixture rests on.
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

// Mutation proof, per host: renaming a key *inside* the arguments proves nothing, since
// firstTaskPathIn walks every string value regardless of its key. The drift that matters is
// the wrapper itself - a host renaming `tool_input` would leave the reader finding nothing -
// so that is the key this proof renames.
const WRAPPER_KEY = "tool_input";
const RENAMED_WRAPPER_CASE_BY_HOST = Object.keys(TASK_DECLARED_FIXTURE_BY_HOST);

for (const host of RENAMED_WRAPPER_CASE_BY_HOST) {
  test(`${host}: renaming the ${WRAPPER_KEY} wrapper the path lives in turns the declaration reader red`, () => {
    const payload = loadFixture(TASK_DECLARED_FIXTURE_BY_HOST[host]);
    assert.equal(
      declaredTaskPath(payload),
      TASK_RELATIVE_PATH,
      "sanity: the un-mutated fixture still declares"
    );

    payload.arguments = payload[WRAPPER_KEY];
    delete payload[WRAPPER_KEY];

    assert.equal(declaredTaskPath(payload), null);
  });
}


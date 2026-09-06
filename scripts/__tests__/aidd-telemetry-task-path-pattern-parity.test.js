const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

/**
 * `TASK_PATH_PATTERN` is duplicated on purpose - opencode-plugin.js's own doc comment
 * explains why it cannot import `hooks/lib/task-declared.cjs` - but nothing pinned the two
 * literals to each other, so one could drift and a task declaration would stop matching on
 * OpenCode alone, silently, with no red anywhere. This reads both source files and compares
 * the literal text of the assignment, not its behaviour: a regex that matches the same
 * strings today but is spelled differently would still be a drift worth catching.
 */

function taskPathPatternLiteral(file) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const match = text.match(/const TASK_PATH_PATTERN =\s*([\s\S]*?);/u);
  assert.ok(match, `${file} no longer declares TASK_PATH_PATTERN the way this guard expects`);
  return match[1].replace(/\s+/gu, " ").trim();
}

describe("TASK_PATH_PATTERN stays identical between its two copies", () => {
  it("opencode-plugin.js's own copy matches lib/task-declared.cjs's, character for character", () => {
    const canonical = taskPathPatternLiteral("plugins/aidd-telemetry/hooks/lib/task-declared.cjs");
    const duplicate = taskPathPatternLiteral("plugins/aidd-telemetry/hooks/opencode-plugin.js");

    assert.equal(
      duplicate,
      canonical,
      "opencode-plugin.js's TASK_PATH_PATTERN drifted from lib/task-declared.cjs's - fix the copy here to match"
    );
  });
});

// A skill's own end, declared the way a task already is: read out of a tool call's own
// free-form arguments, never from a field a host populates. Nothing any host emits says when
// a skill's work finishes - measured, the `tool_result` for a `Skill` call comes back in
// about a tenth of a second, which is the dispatch and not the completion - so the only party
// that can say it is the skill itself, and the only channel it has is a tool call it makes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { declaredStepEnd } = require("../../plugins/aidd-telemetry/hooks/lib/step-ends.cjs");

const pluginsDir = path.join(__dirname, "..", "..", "plugins");

test("reads the skill named by an end marker in a tool call's own arguments", () => {
  const payload = {
    tool_name: "Bash",
    tool_input: { command: 'echo "aidd:step-end aidd-dev:01-plan"' },
  };

  assert.equal(declaredStepEnd(payload), "aidd-dev:01-plan");
});

test("reads it out of Copilot's toolArgs, which carries a JSON string rather than an object", () => {
  const payload = {
    toolName: "bash",
    toolArgs: JSON.stringify({ command: "echo aidd:step-end aidd-context:04-skill-generate" }),
  };

  assert.equal(declaredStepEnd(payload), "aidd-context:04-skill-generate");
});

test("answers null for a tool call that names no end at all", () => {
  const payload = { tool_name: "Bash", tool_input: { command: "pnpm test" } };

  assert.equal(declaredStepEnd(payload), null);
});

// The marker must name its skill. A bare marker would have to close "whatever step is open",
// which closes the wrong one the moment a skill invokes another.
test("answers null for a marker that names no skill", () => {
  const payload = { tool_name: "Bash", tool_input: { command: "echo aidd:step-end" } };

  assert.equal(declaredStepEnd(payload), null);
});

// The same guard `sanitizeSkillName` gives `step_start`: a name is a name, never a path
// fragment or a shell fragment that a later reader would have to defend against.
test("refuses a skill name carrying anything but a skill name", () => {
  const payload = {
    tool_name: "Bash",
    tool_input: { command: "echo aidd:step-end ../../etc/passwd" },
  };

  assert.equal(declaredStepEnd(payload), null);
});

// Every skill that declares its own end must do it in a form the hook actually reads, naming
// the skill it actually is. Written as a sweep rather than a list, so a second skill opting
// in is covered without this file being told - and so a marker that drifts from the pattern,
// or names another skill, fails here rather than silently closing nothing for the life of
// the release.
function skillFilesDeclaringAnEnd() {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name !== "SKILL.md") continue;
      const text = fs.readFileSync(full, "utf8");
      if (text.includes("aidd:step-end")) found.push({ full, text });
    }
  };
  walk(pluginsDir);
  return found;
}

test("every skill declaring its own end declares it in the form the hook reads", () => {
  const declaring = skillFilesDeclaringAnEnd();
  assert.ok(declaring.length > 0, "no skill declares an end - the mechanism has no user");

  for (const { full, text } of declaring) {
    const relative = path.relative(pluginsDir, full);
    const [plugin, , skillDir] = relative.split(path.sep);
    const expected = `${plugin}:${skillDir}`;

    const read = declaredStepEnd({ tool_input: { command: text } });
    assert.equal(read, expected, `${relative} declares an end the hook reads as ${read}`);
  }
});

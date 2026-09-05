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

// The reader's own list of skills that open a flow, read from where it is declared rather
// than repeated here - a fourth orchestrator added to that set is covered by this test
// without this file being told, the same way the test above covers a fifth skill declaring
// an end. Parsed out of the TypeScript source because that set is the one place the fact
// lives; a copy kept here would be the second, and the two would disagree first.
function orchestratingSkillsTheReaderKnows() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "cli", "src", "domain", "models", "flow-attribution.ts"),
    "utf8"
  );
  const declared = /ORCHESTRATING_SKILLS: ReadonlySet<string> = new Set\(\[([^\]]*)\]\)/u.exec(
    source
  );
  assert.ok(declared, "the reader no longer declares its orchestrating skills as a literal set");
  return [...declared[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
}

test("every skill that opens a flow also says when that flow is over", () => {
  // Without the marker a flow closes on the next orchestrating step_start or, failing that,
  // on the journal's own last witnessed moment - so an orchestration that never says it is
  // done goes on owning everything the session did afterwards. The reader stopped closing a
  // flow at a `turn_end` on 2026-09-04, which is what makes this declaration load-bearing
  // rather than a refinement.
  const qualified = orchestratingSkillsTheReaderKnows().filter((skill) => skill.includes(":"));
  assert.ok(qualified.length > 0, "no orchestrating skill is named in the plugin-qualified form");

  for (const skill of qualified) {
    const [plugin, name] = skill.split(":");
    const skillFile = path.join(pluginsDir, plugin, "skills", name, "SKILL.md");
    assert.ok(fs.existsSync(skillFile), `${skill} names no skill in this tree`);
    const read = declaredStepEnd({
      tool_input: { command: fs.readFileSync(skillFile, "utf8") },
    });
    assert.equal(read, skill, `${skill} declares no end the hook reads as its own`);
  }
});

// Every skill, not only the ones that opted in. A skill that never says it is done leaves an
// interval nothing closes: it runs to the next `step_start` or, failing that, to the journal's
// own last witnessed moment, and everything the session did afterwards reads as that skill's
// work. Measured on the one orchestrated session captured, 2026-09-04, before the three
// orchestrators declared theirs: `aidd-dev:01-plan` opened at 06:00:50, closed nothing, and
// took every one of the 972 records written over the three and a half hours that followed.
//
// A sweep and not a list, for the reason the sweep above already gives: a skill added to this
// tree is covered without this file being told.
function everySkillFile() {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "SKILL.md") found.push(full);
    }
  };
  walk(pluginsDir);
  return found;
}

test("every skill says when its own work is done", () => {
  const silent = [];

  for (const full of everySkillFile()) {
    const relative = path.relative(pluginsDir, full);
    const [plugin, , skillDir] = relative.split(path.sep);
    const read = declaredStepEnd({
      tool_input: { command: fs.readFileSync(full, "utf8") },
    });
    if (read !== `${plugin}:${skillDir}`) silent.push(`${relative} declares ${read}`);
  }

  assert.deepEqual(
    silent,
    [],
    `A skill that never declares its end leaves an interval nothing closes.\n${silent.join("\n")}`
  );
});

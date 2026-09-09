const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const GUARD = path.resolve(__dirname, "..", "check-skill-argument-hints.mjs");
const SKILL = "plugins/aidd-probe/skills/01-thing/SKILL.md";

function frontmatter(lines) {
  return ["---", "name: 01-thing", ...lines, "---", "", "# Thing"].join("\n");
}

function plant(dir, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `${contents}\n`);
  }
}

function runOn(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-argument-hints-"));
  try {
    plant(dir, files);
    const result = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: "utf8" });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a skill naming what the user brings passes", () => {
  const clean = runOn({ [SKILL]: frontmatter(["argument-hint: a file path or a ticket"]) });

  assert.equal(clean.status, 0, clean.output);
  assert.match(clean.output, /Every skill names what the user brings/);
});

test("a skill with no argument-hint is named and fails", () => {
  const breach = runOn({ [SKILL]: frontmatter(["description: does a thing"]) });

  assert.equal(breach.status, 1);
  assert.match(breach.output, /skills\/01-thing\/SKILL\.md: no argument-hint/);
});

test("an argument-hint repeating the action slugs is named and fails", () => {
  const breach = runOn({
    [SKILL]: frontmatter(["argument-hint: do | undo"]),
    "plugins/aidd-probe/skills/01-thing/actions/01-do.md": "## Input\n\nA path.",
    "plugins/aidd-probe/skills/01-thing/actions/02-undo.md": "## Input\n\nA path.",
  });

  assert.equal(breach.status, 1);
  assert.match(breach.output, /argument-hint repeats the action slugs/);
});

test("a skill whose actions take no input needs no argument-hint", () => {
  const clean = runOn({
    [SKILL]: frontmatter(["description: takes nothing"]),
    "plugins/aidd-probe/skills/01-thing/actions/01-do.md": "## Process\n\nRun it.",
  });

  assert.equal(clean.status, 0, clean.output);
});

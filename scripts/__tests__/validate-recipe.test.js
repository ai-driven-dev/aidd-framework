const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const script = path.join(
  root,
  "plugins/aidd-context/skills/12-cook/scripts/validate-recipe.mjs",
);

function run(args, cwd = root) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function fixture(lines) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-recipe-validator-"));
  const file = path.join(directory, "recipe.md");
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
  return { directory, file };
}

function validDirect(title = "Valid recipe") {
  return [
    `# ${title}`,
    "",
    "Produce one observable result.",
    "",
    "## Steps to produce the result",
    "",
    "### 1) ✅ Run the check",
    "",
    "This command returns the observable result.",
    "",
    "```bash",
    "echo ok",
    "```",
    "",
    "## Verify",
    "",
    "- Confirm the command prints `ok`.",
  ];
}

test("validates direct and categorized recipes", () => {
  const direct = fixture(validDirect());
  const categorized = fixture([
    "# Categorized recipe",
    "",
    "Produce two observable results.",
    "",
    "## Steps to produce the results",
    "",
    "### 🟢 Beginner",
    "",
    "#### 1) ✅ Run the first check",
    "",
    "This command confirms the prerequisite.",
    "",
    "```bash",
    "echo first",
    "```",
    "",
    "### 🔴 Expert",
    "",
    "#### 2) 🔬 Run the second check",
    "",
    "This command confirms the advanced result.",
    "",
    "```bash",
    "echo second",
    "```",
  ]);

  try {
    const directBefore = fs.readFileSync(direct.file, "utf8");
    const categorizedBefore = fs.readFileSync(categorized.file, "utf8");
    const result = run([direct.file, categorized.file]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "PASS: 2 recipe(s) validated.\n");
    assert.equal(fs.readFileSync(direct.file, "utf8"), directBefore);
    assert.equal(fs.readFileSync(categorized.file, "utf8"), categorizedBefore);
  } finally {
    fs.rmSync(direct.directory, { recursive: true, force: true });
    fs.rmSync(categorized.directory, { recursive: true, force: true });
  }
});

test("reports invalid title and non-continuous steps with line numbers", () => {
  const item = fixture([
    "Intro before title.",
    "# Broken recipe",
    "",
    "Produce a result.",
    "",
    "## Steps to produce a result",
    "",
    "### 2) ✅ Run the check",
    "",
    "This command produces a result.",
    "",
    "```bash",
    "echo ok",
    "```",
  ]);

  try {
    const result = run([item.file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\| .*recipe\.md \| 2 \| title \|/u);
    assert.match(result.stderr, /\| .*recipe\.md \| 8 \| step-number \|/u);
  } finally {
    fs.rmSync(item.directory, { recursive: true, force: true });
  }
});

test("reports missing examples, broken fences, placeholders, and invalid JSON", () => {
  const item = fixture([
    "# Broken examples",
    "",
    "Produce a result.",
    "",
    "## Steps to produce a result",
    "",
    "### 1) ✅ Explain only",
    "",
    "This step still contains <placeholder>.",
    "",
    "### 2) 🔧 Parse JSON",
    "",
    "This malformed example must fail.",
    "",
    "```json",
    "{\"broken\": }",
    "```",
    "",
    "### 3) 🧪 Close the fence",
    "",
    "This example has no closing marker.",
    "",
    "```text",
    "TODO",
  ]);

  try {
    const result = run([item.file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /step-example/u);
    assert.match(result.stderr, /fence-balance/u);
    assert.match(result.stderr, /placeholder/u);
    assert.match(result.stderr, /json-syntax/u);
    assert.match(result.stderr, /todo/u);
  } finally {
    fs.rmSync(item.directory, { recursive: true, force: true });
  }
});

test("rejects a multi-sentence description", () => {
  const lines = validDirect();
  lines[2] = "Produce one result. Then produce another.";
  const item = fixture(lines);

  try {
    const result = run([item.file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /description/u);
  } finally {
    fs.rmSync(item.directory, { recursive: true, force: true });
  }
});

test("rejects extra introductory prose before the steps", () => {
  const lines = validDirect();
  lines.splice(3, 0, "", "This extra introduction is decorative.");
  const item = fixture(lines);

  try {
    const result = run([item.file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /intro-content/u);
  } finally {
    fs.rmSync(item.directory, { recursive: true, force: true });
  }
});

test("rejects a redundant Why section regardless of case or suffix", () => {
  const lines = validDirect();
  lines.splice(4, 0, "## why this matters", "", "This repeats the technique benefits.", "");
  const item = fixture(lines);

  try {
    const result = run([item.file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /redundant-section/u);
  } finally {
    fs.rmSync(item.directory, { recursive: true, force: true });
  }
});

test("rejects a multi-sentence benefit line", () => {
  const lines = validDirect();
  lines[8] = "This command is fast. It returns the observable result.";
  const item = fixture(lines);

  try {
    const result = run([item.file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /step-prose/u);
  } finally {
    fs.rmSync(item.directory, { recursive: true, force: true });
  }
});

test("accepts JSX tags as concrete examples", () => {
  const lines = validDirect();
  lines[10] = "```jsx";
  lines[11] = "const view = <Button>Save</Button>;";
  const item = fixture(lines);

  try {
    const result = run([item.file]);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(item.directory, { recursive: true, force: true });
  }
});

test("accepts C include directives as concrete examples", () => {
  const lines = validDirect();
  lines[10] = "```c";
  lines[11] = "#include <stdio.h>";
  const item = fixture(lines);

  try {
    const result = run([item.file]);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(item.directory, { recursive: true, force: true });
  }
});

test("reports broken local targets and heading anchors", () => {
  const item = fixture([
    "# Broken links",
    "",
    "Produce a result.",
    "",
    "## Steps to produce a result",
    "",
    "### 1) ✅ Open the reference",
    "",
    "This step links to [nothing](missing.md) and [no heading](#absent).",
    "",
    "```text",
    "open reference",
    "```",
  ]);

  try {
    const result = run([item.file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /link-target/u);
    assert.match(result.stderr, /link-anchor/u);
  } finally {
    fs.rmSync(item.directory, { recursive: true, force: true });
  }
});

test("rejects a table of contents on a short recipe", () => {
  const lines = validDirect();
  lines.splice(3, 0, "", "- [Steps](#steps-to-produce-the-result)", "- [Run the check](#1--run-the-check)");
  const item = fixture(lines);

  try {
    const result = run([item.file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /toc-length/u);
  } finally {
    fs.rmSync(item.directory, { recursive: true, force: true });
  }
});

test("rejects duplicate verification and a non-final conclusion", () => {
  const lines = validDirect();
  lines.splice(lines.indexOf("## Verify"), 0, "## In short", "", "Done.", "");
  lines.push("", "## Verify again", "", "- Confirm it twice.");
  const item = fixture(lines);

  try {
    const result = run([item.file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /verify-section/u);
    assert.match(result.stderr, /conclusion-order/u);
  } finally {
    fs.rmSync(item.directory, { recursive: true, force: true });
  }
});

test("--all includes project recipes and bundled recipes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-recipe-all-"));
  const projectRecipes = path.join(directory, "aidd_docs", "recipes");
  fs.mkdirSync(projectRecipes, { recursive: true });
  fs.writeFileSync(path.join(projectRecipes, "project.md"), `${validDirect("Project recipe").join("\n")}\n`, "utf8");

  try {
    const result = run(["--all"], directory);
    assert.equal(result.status, 0, result.stderr);
    const match = result.stdout.match(/PASS: (\d+) recipe\(s\) validated\./u);
    assert.ok(match, result.stdout);
    assert.equal(Number.parseInt(match[1], 10), 4, result.stdout);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("requires paths or --all", () => {
  const result = run([]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pass at least one recipe path or --all/u);
});

test("keeps recipe-template scaffold text inside comments", () => {
  const template = fs.readFileSync(
    path.join(root, "plugins/aidd-context/skills/12-cook/assets/recipe-template.md"),
    "utf8",
  );
  const visible = template.replace(/<!--[\s\S]*?-->/gu, "");

  assert.doesNotMatch(visible, /Recipe title|observable outcome|copyable example/u);
  assert.match(template, /# <!-- Recipe title -->/u);
});

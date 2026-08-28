const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

// The hook is a script, not a module: the CLI copies it into the user's project,
// where a "type": "module" package.json decides how it is parsed. Driving it as a
// subprocess is the only way to test what actually ships.
const HOOK = path.resolve(__dirname, "../../plugins/aidd-context/hooks/update_memory.js");

const OPEN = "<!-- aidd_project_memory:start -->";
const CLOSE = "<!-- aidd_project_memory:end -->";

/** A throwaway project with a memory bank, a context file, and the hook run in it. */
function run({ context, bank = ["architecture.md"], onDemand = [], packageJson, hookAt, args, runs = 1 }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "update-memory-"));
  try {
    fs.mkdirSync(path.join(root, "aidd_docs/memory"), { recursive: true });
    for (const file of bank) fs.writeFileSync(path.join(root, "aidd_docs/memory", file), "# x\n");
    for (const file of onDemand) {
      const full = path.join(root, "aidd_docs/memory", file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, "# x\n");
    }
    if (context !== undefined) fs.writeFileSync(path.join(root, "CLAUDE.md"), context);
    if (packageJson) fs.writeFileSync(path.join(root, "package.json"), packageJson);

    // Copying the hook in mirrors how the CLI installs it, so the project's own
    // package.json governs the module system exactly as it does for a user.
    let hook = HOOK;
    if (hookAt) {
      hook = path.join(root, hookAt);
      fs.mkdirSync(path.dirname(hook), { recursive: true });
      fs.copyFileSync(HOOK, hook);
    }

    const invoke = () => spawnSync(process.execPath, [hook, ...(args ?? ["claude"])], { cwd: root });
    const read = () => fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8");

    const first = invoke();
    const content = read();
    // Read everything before the finally below removes the project.
    return {
      status: first.status,
      stderr: first.stderr.toString(),
      content,
      contentAfterRerun: runs > 1 ? (invoke(), read()) : content,
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("the hook runs in a project declaring itself an ES module", () => {
  const run1 = run({
    context: `# P\n\n${OPEN}\n${CLOSE}\n`,
    packageJson: '{ "type": "module" }\n',
    hookAt: ".claude/hooks/aidd-context/update_memory.js",
  });

  assert.equal(run1.stderr, "");
  assert.equal(run1.status, 0);
  assert.match(run1.content, /@aidd_docs\/memory\/architecture\.md/u);
});

test("a legacy block is migrated to the comment markers and filled", () => {
  const content = run({
    context: "# P\n\n<aidd_project_memory>\n@aidd_docs/memory/old.md\n</aidd_project_memory>\n",
  }).content;

  assert.equal(content.includes("<aidd_project_memory>"), false);
  assert.equal(content, `# P\n\n${OPEN}\n\n@aidd_docs/memory/architecture.md\n\n${CLOSE}\n`);
});

test("a legacy pair quoted in prose is left alone and the real block still migrates", () => {
  const quote = "Old shape: `<aidd_project_memory>` ... `</aidd_project_memory>`.";
  const content = run({
    context: `${quote}\n\n<aidd_project_memory>\n</aidd_project_memory>\n`,
  }).content;

  assert.equal(content.split("\n")[0], quote);
  assert.equal(content.split("\n")[2], OPEN);
});

test("a legacy pair inside a code fence is not the block that gets rewritten", () => {
  const content = run({
    context: [
      "```markdown",
      "<aidd_project_memory>",
      "</aidd_project_memory>",
      "```",
      "",
      "<aidd_project_memory>",
      "</aidd_project_memory>",
      "",
    ].join("\n"),
  }).content;

  const lines = content.split("\n");
  assert.equal(lines[1], "<aidd_project_memory>");
  assert.equal(lines[5], OPEN);
});

test("the imports keep a blank line on each side, so nothing hides them", () => {
  const content = run({
    context: `${OPEN}\n${CLOSE}\n`,
    bank: ["architecture.md", "vcs.md"],
  }).content;

  assert.equal(
    content,
    `${OPEN}\n\n@aidd_docs/memory/architecture.md\n@aidd_docs/memory/vcs.md\n\n${CLOSE}\n`,
  );
});

test("filling is idempotent", () => {
  const result = run({ context: `${OPEN}\n${CLOSE}\n`, runs: 2 });

  assert.equal(result.contentAfterRerun, result.content);
  assert.match(result.content, /@aidd_docs\/memory\/architecture\.md/u);
});

test("the on-demand tier is listed without an import prefix", () => {
  const content = run({
    context: `${OPEN}\n${CLOSE}\n`,
    onDemand: ["internal/decision.md"],
  }).content;

  assert.match(content, /^- aidd_docs\/memory\/internal\/decision\.md$/mu);
});

test("a file holding one marker without its pair reports instead of skipping silently", () => {
  const result = run({ context: `# P\n\n<aidd_project_memory>\n${CLOSE}\n` });

  assert.match(result.stderr, /unpaired project memory marker/u);
});

test("a context file with no block at all is skipped quietly", () => {
  const result = run({ context: "# P\n\nNo block here.\n" });

  assert.equal(result.stderr, "");
  assert.equal(result.content, "# P\n\nNo block here.\n");
});

test("an unknown tool name is rejected", () => {
  const result = run({ context: `${OPEN}\n${CLOSE}\n`, args: ["emacs"] });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown tool emacs/u);
});

test("a new-marker pair quoted in prose above the block does not hijack the splice", () => {
  const quote = `Upgrade note: the block now uses \`${OPEN}\` and \`${CLOSE}\`.`;
  const result = run({ context: `${quote}\n\n${OPEN}\n${CLOSE}\n` });

  assert.equal(result.content.split("\n")[0], quote);
  assert.equal(
    result.content,
    `${quote}\n\n${OPEN}\n\n@aidd_docs/memory/architecture.md\n\n${CLOSE}\n`,
  );
});

test("a nested fence does not close the example that documents the old shape", () => {
  const content = run({
    context: [
      "````markdown",
      "```",
      "<aidd_project_memory>",
      "</aidd_project_memory>",
      "```",
      "````",
      "",
      "<aidd_project_memory>",
      "</aidd_project_memory>",
      "",
    ].join("\n"),
  }).content;

  const lines = content.split("\n");
  assert.equal(lines[2], "<aidd_project_memory>", "the documented example must stay as written");
  assert.equal(lines[7], OPEN, "the real block must be the one migrated");
  assert.match(content, /@aidd_docs\/memory\/architecture\.md/u);
});

test("an unpaired marker fails the run when the skill named the tools", () => {
  const result = run({ context: `# P\n\n${OPEN}\n@stale.md\n` });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unpaired project memory marker/u);
});

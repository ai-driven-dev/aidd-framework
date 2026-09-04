const assert = require("node:assert/strict");
const test = require("node:test");

const {
  readDeclaredTargets,
  referenceFormProblems,
  checkFiles,
} = require("../check-context-reference-form.js");

/**
 * The memory block's reference form, checked against the hook that writes it.
 *
 * `CLAUDE.md` takes `@aidd_docs/…` because Claude Code resolves that import.
 * `AGENTS.md` takes a markdown link because the tools reading it — codex, cursor,
 * opencode — do not: an `@` line there is inert text that loads nothing and says
 * nothing. The hook has known this since #732; what was missing is anything that
 * notices when a file drifts back, which is how the wrong form reached `next`
 * inside an unrelated commit.
 */

const HOOK = `
const TARGET_FILES = [
  { path: "CLAUDE.md", syntax: "at" },
  { path: "AGENTS.md", syntax: "link" },
  { path: ".github/copilot-instructions.md", syntax: "link" },
];
`;

function block(...lines) {
  return [
    "# Title",
    "",
    "<!-- aidd_project_memory:start -->",
    "",
    ...lines,
    "",
    "<!-- aidd_project_memory:end -->",
    "",
  ].join("\n");
}

const AT_LINE = "@aidd_docs/memory/architecture.md";
const LINK_LINE = "[aidd_docs/memory/architecture.md](aidd_docs/memory/architecture.md)";

// ── the hook's table is the source of truth ────────────────────────────────

test("the declared form of each context file is read from the hook itself", () => {
  assert.deepEqual(readDeclaredTargets(HOOK), [
    { path: "CLAUDE.md", syntax: "at" },
    { path: "AGENTS.md", syntax: "link" },
    { path: ".github/copilot-instructions.md", syntax: "link" },
  ]);
});

// A table this cannot read is an unknown, and an unknown is never a pass: the
// check would go green on every file while comparing them against nothing.
test("a hook whose table cannot be read is an error, never an empty pass", () => {
  assert.throws(() => readDeclaredTargets("const TARGET_FILES = whatever;"), /TARGET_FILES/u);
});

// ── the form each file carries ─────────────────────────────────────────────

test("a block written in the form its file declares raises nothing", () => {
  assert.deepEqual(referenceFormProblems(block(AT_LINE), "at"), []);
  assert.deepEqual(referenceFormProblems(block(LINK_LINE), "link"), []);
});

test("an @ import where a markdown link is declared is reported with its line", () => {
  const problems = referenceFormProblems(block(AT_LINE), "link");

  assert.equal(problems.length, 1);
  assert.equal(problems[0].found, "at");
  assert.equal(problems[0].reference, AT_LINE);
  assert.equal(problems[0].line, 5);
});

test("a markdown link where an @ import is declared is reported too", () => {
  const problems = referenceFormProblems(block(LINK_LINE), "at");

  assert.equal(problems.length, 1);
  assert.equal(problems[0].found, "link");
});

// Every reference in the block, not the first: a partially migrated file is the
// shape a half-applied edit leaves behind, and stopping at the first hides it.
test("every reference in the block is checked, not only the first", () => {
  const mixed = block(LINK_LINE, AT_LINE, AT_LINE);

  assert.equal(referenceFormProblems(mixed, "link").length, 2);
});

// ── what is deliberately not a problem ─────────────────────────────────────

test("a context file with no memory block is not a problem", () => {
  assert.deepEqual(referenceFormProblems("# Title\n\nprose only\n", "link"), []);
});

// The block also carries prose, comments and a read-on-demand list. Only lines
// that are a reference are judged; anything else is none of this check's business.
test("prose and html comments inside the block are not references", () => {
  const content = block(
    LINK_LINE,
    "<!-- read on demand, not auto-loaded -->",
    "- aidd_docs/memory/internal/decisions/a-decision.md",
    "some prose about the bank",
  );

  assert.deepEqual(referenceFormProblems(content, "link"), []);
});

// An unpaired marker is `update_memory.js`'s own reported failure; duplicating
// the diagnosis here would give two voices for one fault.
test("an unclosed block is left to the hook to report", () => {
  const unclosed = "# Title\n\n<!-- aidd_project_memory:start -->\n\n" + AT_LINE + "\n";

  assert.deepEqual(referenceFormProblems(unclosed, "link"), []);
});

// ── the files on disk ──────────────────────────────────────────────────────

test("a file the hook declares but the repository does not have is skipped", () => {
  const problems = checkFiles([{ path: "does-not-exist.md", syntax: "link" }], {
    readFileIfPresent: () => null,
  });

  assert.deepEqual(problems, []);
});

test("each problem names the file it was found in", () => {
  const problems = checkFiles([{ path: "AGENTS.md", syntax: "link" }], {
    readFileIfPresent: () => block(AT_LINE),
  });

  assert.equal(problems.length, 1);
  assert.equal(problems[0].file, "AGENTS.md");
  assert.equal(problems[0].expected, "link");
});

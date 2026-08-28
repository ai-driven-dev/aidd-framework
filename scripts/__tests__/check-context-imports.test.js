const assert = require("node:assert/strict");
const test = require("node:test");

const path = require("node:path");

const { findHiddenImports, runCli } = require("../check-context-imports.js");

test("an import inside a bare tag block never loads", () => {
  const hidden = findHiddenImports(
    ["<aidd_project_memory>", "@aidd_docs/memory/vcs.md", "</aidd_project_memory>"].join("\n"),
  );

  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].line, 2);
  assert.equal(hidden[0].openedBy.text, "<aidd_project_memory>");
});

test("a blank line after the opening marker takes the imports out of the block", () => {
  const hidden = findHiddenImports(
    [
      "<!-- aidd_project_memory:start -->",
      "",
      "@aidd_docs/memory/vcs.md",
      "",
      "<!-- aidd_project_memory:end -->",
    ].join("\n"),
  );

  assert.deepEqual(hidden, []);
});

test("an import glued to a comment marker is still hidden", () => {
  const hidden = findHiddenImports(
    ["<!-- aidd_project_memory:start -->", "@aidd_docs/memory/vcs.md"].join("\n"),
  );

  assert.equal(hidden.length, 1);
});

test("the broken shape quoted in documentation is not a finding", () => {
  const hidden = findHiddenImports(
    ["Do not write this:", "", "```markdown", "<tag>", "@a.md", "```", ""].join("\n"),
  );

  assert.deepEqual(hidden, []);
});

test("an import on a bare line loads", () => {
  assert.deepEqual(findHiddenImports("# Title\n\n@a.md\n"), []);
});

test("a longer fence is not closed by a shorter one inside it", () => {
  const hidden = findHiddenImports(
    ["````markdown", "```", "<tag>", "@a.md", "```", "````", ""].join("\n"),
  );

  assert.deepEqual(hidden, []);
});

test("an explicit path that cannot be read fails instead of passing", () => {
  const said = [];
  assert.equal(runCli(["does-not-exist.md"], (line) => said.push(line)), 1);
  assert.match(said.join("\n"), /Not a readable file/u);
});

test("a directory given as an explicit path fails instead of crashing", () => {
  assert.equal(runCli(["scripts"], () => {}), 1);
});

test("the repository's own context files load their imports", () => {
  assert.equal(runCli([path.join(__dirname, "..", "..", "CLAUDE.md")], () => {}), 0);
});

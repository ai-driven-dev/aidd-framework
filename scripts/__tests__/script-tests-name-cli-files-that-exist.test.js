const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { repositoryPathExists } = require("../lib/repository-path.cjs");

// A test under scripts/__tests__ that reads a CLI source or fixture file names it by a
// literal relative path, and the CLI moves its files without reading this directory. The
// refactor into contexts broke two such literals in three commits from `next`, each found
// only when the suite ran red on a branch that had nothing to do with it. `cli/tests/` names
// a fixture the same way `cli/src/` names a source file, and breaks the same way when it
// moves - both are covered here, not just the source half.
test("every cli/src or cli/tests path a script test names by literal resolves on disk", () => {
  const literal = /["'`]\.\.\/\.\.\/(cli\/(?:src|tests)\/[^"'`\s]+)["'`]/gu;
  const dead = [];

  for (const entry of fs.readdirSync(__dirname)) {
    if (!entry.endsWith(".js")) continue;
    const source = fs.readFileSync(path.join(__dirname, entry), "utf8");
    for (const match of source.matchAll(literal)) {
      if (!repositoryPathExists(match[1])) dead.push(`${entry} names ../../${match[1]}`);
    }
  }

  assert.deepEqual(dead, []);
});

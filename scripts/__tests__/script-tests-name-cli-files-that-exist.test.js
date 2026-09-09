const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { repositoryPathExists } = require("../lib/repository-path.cjs");

// A test under scripts/__tests__ names a CLI source or fixture file by a literal relative
// path, and the CLI moves its files without reading this directory - so a rename there is
// found only when this suite runs red on an unrelated branch. `cli/tests/` names a fixture
// the way `cli/src/` names a source file, and both are covered here.
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

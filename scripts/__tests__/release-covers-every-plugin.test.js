const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "../..");

const marketplacePlugins = () =>
  JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin/marketplace.json"), "utf8"))
    .plugins.map((plugin) => plugin.name)
    .sort();

const workflow = () => yaml.load(fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8"));

// A plugin missing from the matrix is tagged by release-please and gets no archive, in
// silence: a job that skips is indistinguishable from a job that has nothing to do.
test("build-plugin builds an archive for every plugin the marketplace lists", () => {
  const matrix = [...workflow().jobs["build-plugin"].strategy.matrix.plugin].sort();

  assert.deepEqual(matrix, marketplacePlugins());
});

test("release-please versions every plugin the marketplace lists", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "release-please-config.json"), "utf8"));
  const versioned = Object.keys(config.packages)
    .filter((p) => p.startsWith("plugins/"))
    .map((p) => p.slice("plugins/".length))
    .sort();

  assert.deepEqual(versioned, marketplacePlugins());
});

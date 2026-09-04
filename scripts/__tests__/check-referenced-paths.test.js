const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  deadReferences,
  referencedPaths,
} = require("../check-referenced-paths.js");

const root = path.resolve(__dirname, "../..");

test("referencedPaths reads a backticked path anchored on a real top-level entry", () => {
  const found = referencedPaths(
    [
      "The manifest is `.claude-plugin/marketplace.json`, and `scripts/check-markdown-links.js` reads it.",
      "Config: `release-please-config.json`.",
    ].join("\n")
  );

  assert.deepEqual(found.map((r) => r.target), [
    ".claude-plugin/marketplace.json",
    "scripts/check-markdown-links.js",
    "release-please-config.json",
  ]);
});

test("referencedPaths ignores what only looks like a path", () => {
  const content = [
    "Accept `application/json` and `application/vnd.github+json`.",
    "A port lives under `domain/ports`, a use case under `application/flows`.",
    "Run `pnpm test:changed`, then `cd cli && pnpm test`.",
    "The tag is `<plugin>-v<semver>` and the file `<root>/.aidd/auth.json`.",
    "Node `>=22.12`.",
    "A tool reads `.claude/skills/` and `.claude/agents/` in the user's project.",
  ].join("\n");

  assert.deepEqual(referencedPaths(content), []);
});

test("deadReferences names the file, the line and the path", () => {
  const tempDir = fs.mkdtempSync(path.join(root, "scripts/__tests__/.tmp-check-referenced-paths-"));

  try {
    // Assembled, never written out: a repository guard reads every source file for a
    // literal path and fails on one nothing holds, which is exactly what this fixture is.
    const dead = ["scripts", "a-file-this-repository-does-not-hold.js"].join("/");
    const page = path.join(tempDir, "page.md");
    fs.writeFileSync(
      page,
      ["# Page", "", "Alive: `scripts/check-markdown-links.js`.", "", `Dead: \`${dead}\`.`, ""].join("\n")
    );

    assert.deepEqual(deadReferences([page]), [{ file: page, line: 5, target: dead }]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("the repository's own prose names no path that does not exist", () => {
  const { scannedFiles, dead } = require("../check-referenced-paths.js").scanRepository();

  assert.ok(scannedFiles > 20, `expected the scan to reach the bank and the docs, got ${scannedFiles}`);
  assert.deepEqual(
    dead.map((d) => `${path.relative(root, d.file)}:${d.line} ${d.target}`),
    []
  );
});

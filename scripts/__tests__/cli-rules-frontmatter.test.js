const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "../..");
const rulesDir = path.join(root, "cli/.claude/rules");

function ruleFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ruleFiles(full);
    return entry.name.endsWith(".md") ? [full] : [];
  });
}

/** The YAML block between the opening and closing `---`, or null when a file has none. */
function frontmatterOf(file) {
  const text = fs.readFileSync(file, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/u.exec(text);
  return match ? yaml.load(match[1]) : null;
}

// A rule is loaded only for the files its `paths` name. One with no frontmatter, or an empty
// `paths`, is never loaded, and nothing reported it: `validate-yaml` globs `*.yml` and reads
// a whole file, so a rule's YAML block reached no gate at all.
test("every CLI rule opens with frontmatter whose `paths` names at least one glob", () => {
  const files = ruleFiles(rulesDir);
  assert.ok(files.length > 0, "no rule found under cli/.claude/rules");

  for (const file of files) {
    const rel = path.relative(root, file);
    const frontmatter = frontmatterOf(file);
    assert.ok(frontmatter && typeof frontmatter === "object", `${rel}: no YAML frontmatter`);
    assert.ok(
      Array.isArray(frontmatter.paths) && frontmatter.paths.length > 0,
      `${rel}: \`paths\` must be a non-empty list`
    );
    for (const glob of frontmatter.paths) {
      assert.equal(typeof glob, "string", `${rel}: every entry of \`paths\` is a glob string`);
    }
  }
});

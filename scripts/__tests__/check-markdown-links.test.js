const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  formatIssue,
  problemForTarget,
  reportProblems,
} = require("../check-markdown-links.js");

const root = path.resolve(__dirname, "../..");
const script = path.join(root, "scripts/check-markdown-links.js");

test("formatIssue includes correction details", () => {
  assert.equal(
    formatIssue({
      raw: "./courses/intro.md",
      reason: "cross-repo-relative-link",
      suggestion: "https://github.com/ai-driven-dev/framework/blob/main/courses/intro.md",
    }),
    "./courses/intro.md (cross-repo relative link; suggestion: https://github.com/ai-driven-dev/framework/blob/main/courses/intro.md)",
  );
});

test("reportProblems writes a markdown source issue table", () => {
  const lines = [];
  const originalConsoleError = console.error;
  console.error = (line = "") => lines.push(line);

  try {
    reportProblems(
      [
        {
          file: path.join(root, "CLAUDE.md"),
          line: 34,
          raw: "@aidd_docs/memory/architecture.md",
          reason: "local-path-not-found",
        },
      ],
      339,
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(lines, [
    "| source | issue |",
    "| - | - |",
    "| CLAUDE.md:34 | @aidd_docs/memory/architecture.md (local path not found) |",
    "",
    "❌ Links: 1 broken in 339 files",
  ]);
});

test("reportProblems writes a success summary when there are no problems", () => {
  const lines = [];

  const status = reportProblems([], 42, () => {
    throw new Error("unexpected error logger call");
  }, (line) => lines.push(line));

  assert.equal(status, 0);
  assert.deepEqual(lines, ["✅ Links: 0 broken in 42 files"]);
});

test("--help documents supported links, exclusions, fixes, and examples", () => {
  const result = spawnSync(process.execPath, [script, "--help"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /node scripts\/check-markdown-links\.js \[--ignore path\]/u);
  assert.match(result.stdout, /Markdown links and images/u);
  assert.match(result.stdout, /@path/u);
  assert.match(result.stdout, /src: path/u);
  assert.match(result.stdout, /Anchor-only links/u);
  assert.match(result.stdout, /mailto:/u);
  assert.match(result.stdout, /tel:/u);
  assert.match(result.stdout, /HTML angle-bracket/u);
  assert.match(result.stdout, /\.git and node_modules/u);
  assert.match(result.stdout, /Runtime variables, glob patterns, and bare words/u);
  assert.match(result.stdout, /\| Need \| Use \|/u);
  assert.match(result.stdout, /\| Include\/import a file in agent context \| @path\/to\/file\.md \|/u);
  assert.match(result.stdout, /\| Reference a file for the reader \| \[label\]\(path\/to\/file\.md\) \|/u);
  assert.match(result.stdout, /\| Case \| Example \|/u);
  assert.match(result.stdout, /@plugins\/aidd-context\/skills\/11-explore\/SKILL\.md/u);
  assert.match(result.stdout, /\[explore skill\]\(plugins\/aidd-context\/skills\/11-explore\/SKILL\.md\)/u);
});

test("CLI checks one markdown file covering supported, ignored, and broken forms", () => {
  const tempDir = fs.mkdtempSync(path.join(root, "scripts/__tests__/.tmp-check-markdown-links-"));
  const fixture = path.join(tempDir, "all-cases.md");
  // A real markdown link is always "/"-separated, like a URL - never path.relative's
  // platform-native separator. Matches how the checker itself normalises before
  // reporting (check-markdown-links.js's own repoRelative/relative handling).
  const relLink = (to) => path.relative(tempDir, to).replaceAll(path.sep, "/");
  const readmePath = relLink(path.join(root, "README.md"));
  const logoPath = relLink(path.join(root, "docs/assets/logo.png"));
  const claudePath = relLink(path.join(root, "CLAUDE.md"));
  const contributingPath = relLink(path.join(root, "CONTRIBUTING.md"));
  const outsidePath = relLink(path.resolve(root, "..", "outside.md"));
  const outsideSuggestion = "https://github.com/ai-driven-dev/framework/blob/main/outside.md";

  fs.writeFileSync(
    fixture,
    [
      "# Link checker fixture",
      "",
      "## Supported existing forms",
      `See [README](${readmePath}).`,
      `![Logo](${logoPath})`,
      `@${claudePath}`,
      `src: ${contributingPath}`,
      "",
      "## Ignored forms",
      "[Anchor only](#local-heading)",
      "[Mail](mailto:security@example.com)",
      "[Phone](tel:+33123456789)",
      "<https://example.com>",
      `<img src="${logoPath}" alt="Logo">`,
      "src: $ARGUMENTS",
      "src: plugins/*/README.md",
      "src: README",
      "[External URL](https://example.com/not-checked.md)",
      "",
      "## Broken forms",
      "[Missing markdown](./missing.md)",
      "@./missing-agent.md",
      "src: ./missing-source.md",
      `[Cross repo](${outsidePath})`,
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    const result = spawnSync(process.execPath, [script, fixture], {
      cwd: root,
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /\| source \| issue \|/u);
    assert.match(result.stderr, /\| - \| - \|/u);
    assert.match(result.stderr, /missing\.md \(local path not found\)/u);
    assert.match(result.stderr, /@\.\/missing-agent\.md \(local path not found\)/u);
    assert.match(result.stderr, /\.\/missing-source\.md \(local path not found\)/u);
    assert.ok(
      result.stderr.includes(`${outsidePath} (cross-repo relative link; suggestion: ${outsideSuggestion})`),
      result.stderr,
    );
    assert.match(result.stderr, /❌ Links: 4 broken in 1 files/u);

    assert.doesNotMatch(result.stderr, /local-heading/u);
    assert.doesNotMatch(result.stderr, /mailto:security@example\.com/u);
    assert.doesNotMatch(result.stderr, /tel:\+33123456789/u);
    assert.doesNotMatch(result.stderr, /(?:^|\s)https?:\/\/example\.com\/not-checked(?:\s|$)/u);
    assert.doesNotMatch(result.stderr, /\$ARGUMENTS/u);
    assert.doesNotMatch(result.stderr, /plugins\/\*\/README\.md/u);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CLI without paths scans the repository and prints a summary", () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /✅ Links: 0 broken in \d+ files/u);
});

test("CLI fails when an explicit input path does not exist", () => {
  const result = spawnSync(process.execPath, [script, "DOES_NOT_EXIST.md"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /❌ Path not found: DOES_NOT_EXIST\.md/u);
});

test("repository scan ignores interrupted test temp directories", () => {
  const tempDir = fs.mkdtempSync(path.join(root, "scripts/__tests__/.tmp-check-markdown-links-"));

  try {
    fs.writeFileSync(path.join(tempDir, "leftover.md"), "[Missing](./missing.md)\n", "utf8");

    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /✅ Links: 0 broken in \d+ files/u);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("problemForTarget reports a fragment no heading in the target file answers", () => {
  const tempDir = fs.mkdtempSync(path.join(root, "scripts/__tests__/.tmp-check-markdown-links-"));

  try {
    const target = path.join(tempDir, "target.md");
    fs.writeFileSync(target, ["# Target", "", "## Commits", "", "## ✅ Code decisions", ""].join("\n"));
    const source = path.join(tempDir, "source.md");

    // The five anchors this repository shipped dead for months all had this shape: a
    // target file that resolves, a fragment nothing in it answers.
    assert.deepEqual(problemForTarget("./target.md#types", source), {
      raw: "./target.md#types",
      reason: "anchor-not-found",
    });

    // Slugging is GitHub's: punctuation dropped, every remaining space a hyphen — so a
    // leading emoji leaves the hyphen it was separated by, and `&` leaves two.
    assert.equal(problemForTarget("./target.md#commits", source), null);
    assert.equal(problemForTarget("./target.md#-code-decisions", source), null);

    // A target that does not resolve is already reported as a missing path; naming the
    // fragment too would be two findings for one fix.
    assert.deepEqual(problemForTarget("./missing.md#commits", source), {
      raw: "./missing.md#commits",
      reason: "local-path-not-found",
    });

    // GitHub's line fragments resolve against the file, not a heading.
    assert.equal(problemForTarget("./target.md#L119", source), null);
    assert.equal(problemForTarget("./target.md#L119-L130", source), null);

    // Only markdown carries headings. A fragment on anything else is the reader's business.
    const asset = path.relative(tempDir, path.join(root, "docs/assets/logo.png")).replaceAll(path.sep, "/");
    assert.equal(problemForTarget(`${asset}#anything`, source), null);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("formatIssue explains a dead fragment", () => {
  assert.equal(
    formatIssue({ raw: "aidd_docs/memory/vcs.md#types", reason: "anchor-not-found" }),
    "aidd_docs/memory/vcs.md#types (no heading in the target file answers that fragment)",
  );
});

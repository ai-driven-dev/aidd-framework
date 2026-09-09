const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const {
  findDuplicates,
  sentencesOf,
  staleBaseline,
} = require("../check-doc-duplication.js");

const script = path.resolve(__dirname, "../check-doc-duplication.js");

/** Twelve words exactly: the floor, so the eleven-word twin below differs by one word only. */
const TWELVE = "The manifest lists every plugin this repository ships to its users today.";
const ELEVEN = "The manifest lists every plugin this repository ships to its users.";
const NORMALISED = "the manifest lists every plugin this repository ships to its users today";

describe("sentencesOf", () => {
  it("keeps a sentence of twelve words and drops one of eleven", () => {
    assert.deepEqual(sentencesOf(`${TWELVE}\n\n${ELEVEN}\n`), [NORMALISED]);
  });

  it("normalises a link, a backtick, case and whitespace to the same sentence", () => {
    const dressed =
      "The `manifest` lists every [plugin](../plugins/README.md) this   Repository ships to its users today.";

    assert.deepEqual(sentencesOf(dressed), [NORMALISED]);
  });

  it("reads nothing out of a code fence, a table row or a heading", () => {
    assert.deepEqual(sentencesOf(["```md", TWELVE, "```", ""].join("\n")), []);
    assert.deepEqual(sentencesOf(["```mermaid", TWELVE, "```", ""].join("\n")), []);
    assert.deepEqual(sentencesOf(`| ${TWELVE} |\n`), []);
    assert.deepEqual(sentencesOf(`## ${TWELVE}\n`), []);
    assert.deepEqual(sentencesOf(`---\ntitle: ${TWELVE}\n---\n`), []);
  });
});

describe("findDuplicates", () => {
  it("reports a sentence two files carry, naming both", () => {
    const found = findDuplicates(
      { "docs/a.md": `${TWELVE}\n`, "docs/b.md": `Intro.\n\n${TWELVE}\n` },
      {}
    );

    assert.deepEqual(found, [{ sentence: NORMALISED, files: ["docs/a.md", "docs/b.md"] }]);
  });

  it("reports nothing for a sentence one word under the floor", () => {
    assert.deepEqual(
      findDuplicates({ "docs/a.md": `${ELEVEN}\n`, "docs/b.md": `${ELEVEN}\n` }, {}),
      []
    );
  });

  it("matches across a link, a backtick, case and whitespace", () => {
    const dressed =
      "The `manifest` lists every [plugin](../plugins/README.md) this   Repository ships to its users today.";

    assert.deepEqual(findDuplicates({ "docs/a.md": TWELVE, "docs/b.md": dressed }, {}), [
      { sentence: NORMALISED, files: ["docs/a.md", "docs/b.md"] },
    ]);
  });

  it("reports nothing when the second copy sits in a fence, a table row or a heading", () => {
    const fenced = ["```md", TWELVE, "```"].join("\n");

    assert.deepEqual(findDuplicates({ "docs/a.md": TWELVE, "docs/b.md": fenced }, {}), []);
    assert.deepEqual(findDuplicates({ "docs/a.md": TWELVE, "docs/b.md": `| ${TWELVE} |` }, {}), []);
    assert.deepEqual(findDuplicates({ "docs/a.md": TWELVE, "docs/b.md": `## ${TWELVE}` }, {}), []);
  });

  it("silences the files a baseline entry lists and no other", () => {
    const files = {
      "docs/a.md": TWELVE,
      "docs/b.md": TWELVE,
      "docs/c.md": TWELVE,
      "docs/d.md": TWELVE,
    };
    const baseline = {
      [NORMALISED]: { "docs/a.md": "a reason", "docs/b.md": "a reason" },
    };

    assert.deepEqual(findDuplicates(files, baseline), [
      { sentence: NORMALISED, files: ["docs/c.md", "docs/d.md"] },
    ]);
  });

  it("reports nothing once a baseline entry covers every carrier", () => {
    const baseline = {
      [NORMALISED]: { "docs/a.md": "a reason", "docs/b.md": "a reason" },
    };

    assert.deepEqual(findDuplicates({ "docs/a.md": TWELVE, "docs/b.md": TWELVE }, baseline), []);
  });
});

describe("staleBaseline", () => {
  it("reports an entry whose sentence left one of the files it lists", () => {
    const baseline = {
      [NORMALISED]: { "docs/a.md": "a reason", "docs/b.md": "a reason" },
    };

    const stale = staleBaseline({ "docs/a.md": TWELVE, "docs/b.md": "Something else.\n" }, baseline);

    assert.equal(stale.length, 1);
    assert.match(stale[0], /docs\/b\.md/u);
    assert.match(stale[0], /drop it from BASELINE/u);
  });

  it("reports nothing while every listed file still carries the sentence", () => {
    const baseline = {
      [NORMALISED]: { "docs/a.md": "a reason", "docs/b.md": "a reason" },
    };

    assert.deepEqual(staleBaseline({ "docs/a.md": TWELVE, "docs/b.md": TWELVE }, baseline), []);
  });
});

describe("the command line", () => {
  /** spawnSync with an argument array, never a shell string: a Windows shell splits a quoted
   * path on its spaces and the run reports a missing script instead of a duplicate. */
  function runIn(cwd) {
    return cp.spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });
  }

  it("exits 1 on a planted duplicate and 0 once one copy points at the other", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-doc-dup-"));

    try {
      fs.mkdirSync(path.join(cwd, "docs"), { recursive: true });
      fs.writeFileSync(path.join(cwd, "docs", "a.md"), `# A\n\n${TWELVE}\n`);
      fs.writeFileSync(path.join(cwd, "docs", "b.md"), `# B\n\n${TWELVE}\n`);

      const failed = runIn(cwd);
      assert.equal(failed.status, 1, failed.stdout + failed.stderr);
      assert.match(failed.stdout + failed.stderr, /docs\/b\.md/u);
      assert.match(failed.stdout + failed.stderr, /keep it in one home/u);

      fs.writeFileSync(path.join(cwd, "docs", "b.md"), "# B\n\nWhat it lists: [A](a.md).\n");

      const passed = runIn(cwd);
      assert.equal(passed.status, 0, passed.stdout + passed.stderr);
      assert.match(passed.stdout, /2 files/u);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("this repository", () => {
  it("carries no sentence twice outside BASELINE", () => {
    const { duplicates, stale, scannedFiles } = require("../check-doc-duplication.js").scanRepository(
      path.resolve(__dirname, "../..")
    );

    assert.ok(scannedFiles > 20, `expected the scan to reach the banks and the docs, got ${scannedFiles}`);
    assert.deepEqual(stale, []);
    assert.deepEqual(
      duplicates.map((d) => `${d.sentence} :: ${d.files.join(", ")}`),
      []
    );
  });
});

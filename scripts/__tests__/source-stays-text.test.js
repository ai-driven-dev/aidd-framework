const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

/**
 * A source file must stay readable by the tools people actually use on it.
 *
 * `cost-report.ts` carried two raw NUL bytes as the separator of a composite key. The
 * technique is sound - a byte that cannot occur in any component makes the key unambiguous -
 * but written as raw bytes rather than the `\u0000` escape it made `file` report `data`, and
 * every `grep` over those 1072 lines return nothing at all, silently. Not "no match with a
 * warning": no output, exit 1, indistinguishable from a genuine absence.
 *
 * That is how a reviewer concludes a symbol is missing from the one file that defines it.
 * It happened, on this repository, while reading that exact file.
 *
 * The escape compiles to the identical string, so nothing about the key changes - only
 * whether a person can search the file that builds it.
 */
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".cjs",
  ".mjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
]);

function trackedTextFiles() {
  const listed = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "buffer" });
  return listed
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((rel) => TEXT_EXTENSIONS.has(path.extname(rel)));
}

describe("every tracked source file stays greppable", () => {
  it("carries no raw NUL byte, so no search over it can fail in silence", () => {
    const files = trackedTextFiles();

    // A walk that found nothing would pass this test while checking nothing at all.
    assert.ok(files.length > 500, `expected the repository's source files, found ${files.length}`);

    const offenders = [];
    for (const rel of files) {
      const bytes = fs.readFileSync(path.join(ROOT, rel));
      if (bytes.includes(0)) {
        const line = bytes.subarray(0, bytes.indexOf(0)).toString("utf8").split("\n").length;
        offenders.push(`${rel}:${line}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `raw NUL bytes make a file binary to grep and diff; write the \u0000 escape instead:\n  ${offenders.join("\n  ")}`
    );
  });
});

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const CLI_SRC_PREFIX = "cli/src/";

/**
 * "One route, and every sentence about it true"
 * (aidd_docs/tasks/2026_08/2026_08_28_one-route-that-is-true/) deleted the one thing this
 * codebase ever ran that opened a network listener: `aidd telemetry receive`, an OTLP/HTTP
 * server bound to a local port so a tool's own export could be captured. That route is now
 * read-only history - the writer, its adapter, and the port it bound are gone - and the
 * spec's own hard constraint is that this stays true of the *code*, not a promise in a
 * document: "Nothing this system runs opens a network listener, and nothing it runs sends
 * anything anywhere."
 *
 * This is the same kind of check `source-stays-text.test.js` runs: walk every tracked
 * source file under `cli/src`, grep for the literal patterns a listener is built from, and
 * fail loudly if one reappears - a future listener then has to be a deliberate decision
 * (this test's assertion updated, with a reason), never an accident nobody noticed.
 *
 * Deliberately narrow to *server* construction, not merely importing `node:http` or
 * `node:net` - this codebase makes plenty of outbound HTTP calls (checking for updates,
 * fetching a marketplace, downloading a release), and an outbound client is not the thing
 * this test exists to forbid.
 */
const FORBIDDEN_PATTERNS = [
  { pattern: /\.createServer\s*\(/u, label: ".createServer(" },
  { pattern: /\.listen\s*\(\s*(?:port|\d)/u, label: ".listen(<port>" },
  { pattern: /from ["']node:net["']/u, label: 'import from "node:net"' },
  { pattern: /require\(["']node:net["']\)/u, label: 'require("node:net")' },
];

function trackedCliSourceFiles() {
  const listed = execFileSync("git", ["ls-files", "-z", "--", CLI_SRC_PREFIX], {
    cwd: ROOT,
    encoding: "buffer",
  });
  return listed
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((rel) => rel.endsWith(".ts"));
}

describe("nothing in cli/src opens a network listener", () => {
  it("no source file constructs or binds a server", () => {
    const files = trackedCliSourceFiles();

    // A walk that found nothing would pass this test while checking nothing at all.
    assert.ok(files.length > 300, `expected the CLI's source tree, found ${files.length} files`);

    const offenders = [];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      for (const { pattern, label } of FORBIDDEN_PATTERNS) {
        if (pattern.test(text)) offenders.push(`${rel}: ${label}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `a source file opens or names a network listener - this codebase's one hard ` +
        `constraint is that nothing it runs does that:\n  ${offenders.join("\n  ")}`
    );
  });
});

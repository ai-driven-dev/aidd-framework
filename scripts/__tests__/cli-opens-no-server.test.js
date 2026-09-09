const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const CLI_SRC_PREFIX = "cli/src/";

/**
 * Nothing this system runs opens a network listener, and the constraint has to stay true of
 * the code rather than of a document. This walks every tracked source file under `cli/src`
 * and greps for the literal patterns a listener is built from, so a future listener has to be
 * a deliberate decision — this assertion updated, with a reason — never an accident.
 *
 * Deliberately narrow to server construction, not merely importing `node:http` or `node:net`:
 * this codebase makes plenty of outbound calls, and a client is not what this forbids.
 */
const FORBIDDEN_PATTERNS = [
  // No leading `\.`: `createServer` imported by name (`import { createServer } from
  // "node:http"`) and called bare is the same listener as `http.createServer(...)`, and the
  // dotted-only pattern missed it.
  { pattern: /\bcreateServer\s*\(/u, label: "createServer(" },
  // No constraint on the argument: `.listen(process.env.PORT)`, `.listen({ port })` and
  // `.listen(PORT)` (an uppercase identifier) all bind a server, and none starts with a
  // literal "port" or a digit the way `.listen(\s*(?:port|\d)` required.
  { pattern: /\.listen\s*\(/u, label: ".listen(" },
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

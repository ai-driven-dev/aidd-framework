const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const SCRIPTS = ["cli/scripts/smoke-tools.sh", "cli/scripts/smoke-real.sh"];

/** Each `node -e '...'` block, as the text between its opening and closing quote. */
function inlineNodeBlocks(script) {
  const blocks = [];
  const opener = /node -e '/g;
  let match = opener.exec(script);
  while (match !== null) {
    const start = match.index + match[0].length;
    const end = script.indexOf("' ", start);
    blocks.push({ line: script.slice(0, start).split("\n").length, body: script.slice(start, end) });
    match = opener.exec(script);
  }
  return blocks;
}

// `bash -n` accepts a script whose single quotes still pair up across lines, so an
// apostrophe in a comment inside a `node -e '...'` block passes the syntax check and
// fails at run time, in the one phase gated on a binary the CI never has. A JavaScript
// comment or string inside such a block therefore carries no single quote at all.
test("no single quote survives inside an inline node block of a smoke script", () => {
  for (const rel of SCRIPTS) {
    const script = fs.readFileSync(path.join(root, rel), "utf8");
    for (const block of inlineNodeBlocks(script)) {
      assert.ok(
        !block.body.includes("'"),
        `${rel}:${block.line}: a single quote inside a node -e block ends the bash string early`
      );
    }
  }
});

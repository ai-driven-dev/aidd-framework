const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

/**
 * A skill never links outside itself (the tree ships both flat and as a marketplace, so no
 * relative path survives both), which is why the explanation for why a skill must announce
 * its own end by hand is written out in full in every orchestrating skill rather than linked
 * once. That triplication is a deliberate tradeoff, not an oversight - but nothing pinned the
 * three copies to each other, so one could drift and a flow would stop being measured
 * without anything going red. This is that pin, on the model of
 * aidd-telemetry-step-end.test.js's own parity checks.
 */
const ORCHESTRATING_SKILLS = [
  "plugins/aidd-orchestrator/skills/00-async-dev/SKILL.md",
  "plugins/aidd-orchestrator/skills/01-sdlc/SKILL.md",
  "plugins/aidd-orchestrator/skills/02-backlog/SKILL.md",
];

const PARAGRAPH_START = "No host reports when an orchestration finished.";

function sharedExplanation(file) {
  // A Windows checkout may carry CRLF; the comparison is about words, never line endings.
  const text = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
  const start = text.indexOf(PARAGRAPH_START);
  assert.ok(start !== -1, `${file} no longer carries the shared "No host reports" explanation`);
  const end = text.indexOf("\n\n", start);
  return text.slice(start, end === -1 ? undefined : end).trim();
}

test('every orchestrating skill\'s "No host reports" explanation agrees with the others, word for word', () => {
  const [canonicalFile, ...rest] = ORCHESTRATING_SKILLS;
  const canonical = sharedExplanation(canonicalFile);

  for (const file of rest) {
    assert.equal(
      sharedExplanation(file),
      canonical,
      `${file}'s explanation drifted from ${canonicalFile}'s - one of the two now says something different`
    );
  }
});

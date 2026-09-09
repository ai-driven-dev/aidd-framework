const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const PLUGIN = path.join(ROOT, "plugins/aidd-telemetry");

/**
 * The three places this plugin requires `aidd` to answer, each the first numbered step of its
 * own action file. A fourth skill, or a fourth wording, is what this guards against.
 */
const LOCATING_ACTIONS = [
  "skills/00-init/actions/01-check.md",
  "skills/01-cost/actions/01-locate.md",
  "skills/02-check/actions/01-locate.md",
];

const BLOCK_START = "No output, or a command that is not found";
const BLOCK_END = "tool that cost nothing.";

/** The absent-CLI wording alone: what a skill says once `aidd --version` comes back empty
 * or unresolved, from the sentence that names the condition through the sentence that
 * forbids continuing. Not the whole action - the opening line naming what answering does
 * is allowed to differ per skill, since each skill answers something different. */
function absentCliWording(relativePath) {
  const text = fs.readFileSync(path.join(PLUGIN, relativePath), "utf8");
  const start = text.indexOf(BLOCK_START);
  const end = text.indexOf(BLOCK_END);
  assert.ok(start !== -1, `${relativePath} must name the absent-CLI condition`);
  assert.ok(end !== -1, `${relativePath} must forbid continuing to a report`);
  return text.slice(start, end + BLOCK_END.length);
}

describe("every skill that needs the CLI says so the same way", () => {
  it("the absent-CLI wording is identical, character for character, across all three", () => {
    const [first, ...rest] = LOCATING_ACTIONS.map(absentCliWording);
    for (const [index, wording] of rest.entries()) {
      assert.equal(wording, first, `${LOCATING_ACTIONS[index + 1]} must match ${LOCATING_ACTIONS[0]} exactly`);
    }
  });

  it("the wording itself forbids reaching a report", () => {
    for (const relativePath of LOCATING_ACTIONS) {
      const wording = absentCliWording(relativePath);
      assert.match(wording, /\*\*Stop, and\b/u, `${relativePath} must stop unconditionally`);
      assert.match(
        wording,
        /Never continue to a report/u,
        `${relativePath} must forbid continuing to a report`
      );
    }
  });

  it("requiring the CLI is the first thing each action does, not a later branch", () => {
    for (const relativePath of LOCATING_ACTIONS) {
      const text = fs.readFileSync(path.join(PLUGIN, relativePath), "utf8");
      const processIdx = text.indexOf("## Process");
      const firstStepIdx = text.indexOf("1. **Require the CLI.**");
      const blockIdx = text.indexOf(BLOCK_START);
      assert.ok(processIdx !== -1 && firstStepIdx !== -1, `${relativePath} must open with "Require the CLI"`);
      assert.ok(
        processIdx < firstStepIdx && firstStepIdx < blockIdx,
        `${relativePath} must check the CLI before anything else in its Process`
      );
    }
  });

  it("recording is stated as unaffected wherever the CLI is named as required", () => {
    for (const relativePath of LOCATING_ACTIONS) {
      const wording = absentCliWording(relativePath);
      assert.match(
        wording,
        /recording is unaffected.*hooks that write the journal are plain node/su,
        `${relativePath} must say recording keeps working without the CLI`
      );
    }
  });
});

const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

/**
 * A task folder declares the backlog item it delivers in `backlog-link.json`, and the whole
 * `by_backlog` axis rests on that one file being readable.
 *
 * Nothing checked that it was. Of the three declarations this repository held, two carried
 * `writtenAt` and `writtenBy` while `task-backlog-adapter.ts` reads `written_at` and
 * `written_by`, so the report answered `declaration: unreadable` for 130 records and named
 * the item for 4. Both were written by `aidd-orchestrator:01-sdlc`, which is told to let
 * Spec or Plan declare the item and instead wrote the file itself, taking the field names
 * from the TypeScript interface rather than from what either skill teaches.
 *
 * The reader is a `cli/` module and this is a repository script test, so the rule is
 * restated here rather than imported across that boundary — and the second case below is
 * what keeps the restatement honest.
 */
const REQUIRED_FIELDS = ["backlog", "written_at", "written_by"];

function trackedBacklogLinks() {
  return cp
    .execSync("git ls-files '*backlog-link.json'", { cwd: ROOT, encoding: "utf8" })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}

describe("every backlog declaration in this repository is one the report can read", () => {
  it("names the fields the reader looks for, in the spelling it looks for them", () => {
    const unreadable = [];

    for (const file of trackedBacklogLinks()) {
      let parsed;
      try {
        parsed = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
      } catch (error) {
        unreadable.push(`${file} is not JSON: ${error.message}`);
        continue;
      }
      const missing = REQUIRED_FIELDS.filter(
        (field) => typeof parsed[field] !== "string" || parsed[field] === ""
      );
      if (missing.length > 0) {
        unreadable.push(`${file} is missing ${missing.join(", ")} (has ${Object.keys(parsed).join(", ")})`);
      }
    }

    assert.deepEqual(
      unreadable,
      [],
      `A task folder declares a backlog item the report cannot read, so its work counts as ` +
        `\`unreadable\` and the item is never named.\n${unreadable.join("\n")}`
    );
  });

  /** The two skills that teach the file are the only things that decide what gets written,
   * so they have to teach the same three names — and the same three this test asks for.
   * Read from the skills rather than trusted: a taught shape drifting away from the reader
   * is exactly what produced the two unreadable files, and a guard restating the fields
   * without checking the lesson would have stayed green through it. */
  it("is the shape both skills that write it actually teach", () => {
    const TEACHING_ACTIONS = [
      "plugins/aidd-pm/skills/04-spec/actions/01-build.md",
      "plugins/aidd-dev/skills/01-plan/actions/04-plan.md",
    ];

    for (const action of TEACHING_ACTIONS) {
      const text = fs.readFileSync(path.join(ROOT, action), "utf8");
      for (const field of REQUIRED_FIELDS) {
        assert.ok(text.includes(`"${field}"`), `${action} must teach the field "${field}"`);
      }
    }
  });
});

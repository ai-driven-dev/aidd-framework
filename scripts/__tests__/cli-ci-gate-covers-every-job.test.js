const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "../..");

const cliCiWorkflow = () =>
  yaml.load(fs.readFileSync(path.join(root, ".github/workflows/cli-ci.yml"), "utf8"));

// #757 and #759 both merged with `cli CI`'s real jobs red, because no required check
// named a single one of them — the rulesets only required `lefthook` and `Commitlint`.
// `gate` fans every job in, so a future job silently missing from its `needs` is the same
// bug again with a different name. Written once, kept true by construction: this reads
// the job list live off the workflow rather than duplicating it by hand.
test("cli-ci.yml's gate job needs every other job in the workflow", () => {
  const jobs = cliCiWorkflow().jobs;
  const everyOtherJob = Object.keys(jobs)
    .filter((name) => name !== "gate")
    .sort();
  const gateNeeds = [...jobs.gate.needs].sort();

  assert.deepEqual(gateNeeds, everyOtherJob);
});

test("gate reports even when a needed job fails or is skipped (if: always())", () => {
  assert.equal(cliCiWorkflow().jobs.gate.if, "always()");
});

// The ruleset JSON is the one GitHub actually enforces once an admin applies it
// (`docs/MAINTAINERS.md`); this only pins that the file names the right check.
test("both branch rulesets require the cli/gate check by its exact job name", () => {
  const gateName = cliCiWorkflow().jobs.gate.name;

  for (const rulesetFile of ["main.json", "next.json"]) {
    const ruleset = JSON.parse(
      fs.readFileSync(path.join(root, ".github/rulesets", rulesetFile), "utf8")
    );
    const statusCheckRule = ruleset.rules.find((rule) => rule.type === "required_status_checks");
    const contexts = statusCheckRule.parameters.required_status_checks.map((c) => c.context);

    assert.ok(
      contexts.includes(gateName),
      `${rulesetFile} does not require "${gateName}" in its required_status_checks`
    );
  }
});

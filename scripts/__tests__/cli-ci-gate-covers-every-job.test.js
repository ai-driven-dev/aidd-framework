const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "../..");

const cliCiWorkflow = () =>
  yaml.load(fs.readFileSync(path.join(root, ".github/workflows/cli-ci.yml"), "utf8"));

// A pull request merges with `cli CI`'s real jobs red when no required check names one of
// them. `gate` fans every job in, so a job silently missing from its `needs` is that bug
// again: this reads the job list live off the workflow rather than duplicating it by hand.
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

// The filter decides whether the suite runs at all. A change to the workflow itself is a
// change nothing else in the filter matches, so unless the filter names its own file, the
// commit that changes how the suite runs is the one commit the suite never runs on.
test("the changes filter names the workflow file itself as relevant", () => {
  const changes = cliCiWorkflow().jobs.changes;
  const script = changes.steps.map((step) => step.run ?? "").join("\n");
  const ownPath = ".github/workflows/cli-ci.yml";

  assert.match(
    script,
    new RegExp(`^\\s*${ownPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)\\s*$`, "m"),
    `${ownPath} must be a case of the relevance filter, on its own line`
  );
});

test("only a previously gated next snapshot skips the promotion mutation matrix", () => {
  const workflow = cliCiWorkflow();
  const changes = workflow.jobs.changes;
  const promotion = changes.steps.find((step) => step.id === "promotion");
  const mutation = changes.steps.find((step) => step.id === "mutation");

  assert.equal(workflow.permissions.actions, "read");
  assert.equal(changes.outputs.trusted_promotion, "${{ steps.promotion.outputs.trusted }}");
  assert.equal(promotion.name, "Check whether a promotion snapshot passed next");
  assert.match(promotion.run, /EVENT_NAME.*pull_request/);
  assert.match(promotion.run, /BASE_REF.*main/);
  assert.match(promotion.run, /HEAD_REF.*\^promote\/next-to-main-\[0-9\]\+\$/);
  assert.match(promotion.run, /branch=next&event=push&status=completed&head_sha=\$HEAD_SHA/);
  assert.match(promotion.run, /\.conclusion == "success"/);
  assert.match(promotion.run, /\.name == "cli \/ gate" and \.conclusion == "success"/);
  assert.match(promotion.run, /2>\/dev\/null \|\| true/);

  assert.match(mutation.run, /steps\.promotion\.outputs\.trusted.*== "true"/);
  assert.match(mutation.run, /scopes='\[\]'/);
  assert.match(mutation.run, /else[\s\S]*mutation-scopes-to-run\.mjs/);
  assert.equal(workflow.jobs["cli-mutation"].if, "needs.changes.outputs.mutation_scopes != '[]'");

  // These checks validate GitHub's pull-request merge ref; they are not evidence that next's
  // source snapshot passed, so mutation reuse must not turn any of them off.
  for (const name of [
    "cli-typecheck",
    "cli-lint",
    "cli-architecture",
    "cli-coverage",
    "cli-smoke",
    "cli-build",
    "cli-knip",
    "identifier-join",
    "cli-jscpd",
    "kanban-checks",
    "windows",
  ]) {
    assert.deepEqual(workflow.jobs[name].needs, ["changes"], `${name} must still depend on changes`);
    assert.equal(
      workflow.jobs[name].if,
      "needs.changes.outputs.relevant == 'true'",
      `${name} must still run for a relevant promotion PR`
    );
  }
});

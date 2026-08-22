const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const pluginDir = path.resolve(__dirname, "../../plugins/aidd-telemetry");
const skillDir = path.join(pluginDir, "skills/01-cost");
const skill = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
// A router skill's rules live in its actions; reading only the router would test a
// table of contents.
const actions = fs
  .readdirSync(path.join(skillDir, "actions"))
  .map((name) => fs.readFileSync(path.join(skillDir, "actions", name), "utf8"))
  .join("\n");
const everything = `${skill}\n${actions}`;

test("the cost skill calls the plugin's own binary, never the CLI", () => {
  assert.ok(everything.includes("telemetry-report.js"), "must call the script the plugin ships");
  assert.ok(
    !/\baidd telemetry\b/u.test(everything),
    "must not depend on the CLI: the plugin measures on its own",
  );
});

// The whole point of the machine-readable output is that a skill consumes it. A skill
// reading the human rendering scrapes aligned columns and breaks when one gets wider.
test("the cost skill reads the object, never the text meant for a person", () => {
  assert.ok(everything.includes("--json"), "must ask for the machine-readable output");
  assert.ok(
    everything.includes("cost_report_version"),
    "must refuse a version it does not know, which means naming the field",
  );
});

test("the cost skill branches on declared capability, not on a missing number", () => {
  for (const field of ["capability", "journal_attributable", "task_attributable"]) {
    assert.ok(everything.includes(field), `must read "${field}" rather than infer the limit`);
  }
});

test("the cost skill says when a total is partial", () => {
  assert.ok(everything.includes("undated_records"), "must notice records in no period");
  assert.ok(everything.includes("unreadable_lines"), "must notice lines it could not read");
});

test("the cost skill prefers an absolute period for a figure that will be kept", () => {
  assert.ok(everything.includes("--from"), "must know the absolute flags");
  assert.ok(
    everything.includes("resolves against today"),
    "must say why --days cannot be cited",
  );
});

// A skill holding its own aggregation would be a second way of computing one number, and
// two ways of computing a number is how they start disagreeing. It shows what the command
// printed; it never adds anything up.
test("the cost skill computes nothing itself", () => {
  for (const forbidden of ["reduce(", "sum(", "* 0.", "rate per", "per 1M", "per 1K"]) {
    assert.ok(!everything.includes(forbidden), `skill must not compute: found "${forbidden}"`);
  }
});

test("the cost skill refuses to invent a figure when its script is absent", () => {
  assert.ok(everything.includes("show no figure"), "must state that no figure is shown");
  assert.ok(
    everything.includes("cannot be found"),
    "must name the unresolvable script as the reason",
  );
});

test("the cost skill never turns unattributed into a claim that no step ran", () => {
  assert.ok(everything.includes("unattributed"), "must name the value the report prints");
  assert.ok(!everything.includes("no step ran\n"), "must not restate it as a claim");
});

test("the cost skill states the limits a reader will ask about", () => {
  assert.ok(fs.existsSync(path.resolve(__dirname, "../../docs/telemetry-limits.md")));
  // Named where the skill acts on them, not only linked: a limit a reader has to go and
  // look up is a limit that gets read as a zero.
  for (const limit of ["not covered", "unattributed", "unknown"]) {
    assert.ok(everything.includes(limit), `must handle "${limit}" rather than defer it`);
  }
});

test("the limits document gives every partly-measurable tool its reason, not just its name", () => {
  // Pinned on the reason rather than on a heading: the headings have already had to change
  // once, when a tool that "cannot be measured at all" turned out to journal fine.
  const limits = fs.readFileSync(path.resolve(__dirname, "../../docs/telemetry-limits.md"), "utf8");
  for (const [tool, reason] of [
    ["Cursor", "no token count in any file"],
    ["Copilot", "outputTokens"],
    ["Codex", "trust"],
  ]) {
    assert.ok(limits.includes(tool), `${tool} is named`);
    assert.ok(limits.includes(reason), `${tool}'s reason, not just its name`);
  }
  assert.ok(
    limits.includes("only Claude Code's carries one in a readable form"),
    "which tool's writes name a task, and which do not",
  );
});

test("the measurement script ships inside a skill, where a plugin install carries it", () => {
  // A plugin is installed by translating its files into each tool's own layout, and that
  // translation carries skills/, agents/, commands/, rules/ and hooks/ — a script anywhere
  // else is silently never installed.
  assert.ok(!fs.existsSync(path.join(pluginDir, "bin")), "no top-level bin/, which is dropped");
  for (const script of [
    "skills/00-init/scripts/telemetry-switch.js",
    "skills/01-cost/scripts/telemetry-report.js",
    "skills/02-check/scripts/telemetry-check.js",
  ]) {
    const full = path.join(pluginDir, script);
    assert.ok(fs.existsSync(full), `${script} must live under the skill that owns it`);
    assert.ok(
      fs.readFileSync(full, "utf8").startsWith("#!/usr/bin/env node"),
      `${script} must be runnable on its own`,
    );
  }
});

test("each skill finds its own script on a tool that sets no plugin-root variable", () => {
  // Measured on Codex: `env | grep -i plugin_root` in the shell a skill spawns matches
  // nothing. A search that only knows Claude Code's directory finds nothing there, and the
  // skill would report its own script missing on a tool where it is installed.
  const searched = [
    ["skills/00-init/actions/01-check.md", "telemetry-switch.js"],
    ["skills/01-cost/actions/01-locate.md", "telemetry-report.js"],
    ["skills/02-check/actions/01-locate.md", "telemetry-check.js"],
  ];
  for (const [action, script] of searched) {
    const text = fs.readFileSync(path.join(pluginDir, action), "utf8");
    const [search] = text.split("\n").filter((line) => line.includes("find "));
    assert.ok(search, `${action} must search for ${script}`);
    // Tokenized, not substring-matched: ".claude/plugins" is a substring of
    // "~/.claude/plugins" too, and Claude and Codex install project-relative
    // (`claude.ts`'s and `codex.ts`'s own `pluginsDir`), not under the home directory.
    const tokens = search.trim().split(/\s+/u);
    for (const dir of [
      "~/.claude/plugins",
      "~/.codex/plugins",
      "~/.cursor/plugins",
      ".github/plugins",
      ".claude/plugins",
      ".codex/plugins",
    ]) {
      assert.ok(tokens.includes(dir), `${action} must look in ${dir}`);
    }
    const cwd = tokens.lastIndexOf(".");
    for (const dir of [".claude/plugins", ".codex/plugins", ".github/plugins"]) {
      assert.ok(
        tokens.indexOf(dir) < cwd,
        `${action} must reach ${dir}, where a project-scope install actually lands, before the working directory`,
      );
    }
  }
});

test("the init skill owns turning measurement on, and asks first", () => {
  const initDir = path.join(pluginDir, "skills/00-init");
  const init = fs
    .readdirSync(path.join(initDir, "actions"))
    .map((name) => fs.readFileSync(path.join(initDir, "actions", name), "utf8"))
    .join("\n");

  assert.ok(init.includes("telemetry-switch.js> on"), "must be the place that turns it on");
  assert.ok(/[Aa]sk/u.test(init), "must ask before measuring someone's project");
  assert.ok(!/\baidd telemetry\b/u.test(init), "must not depend on the CLI");
});

test("the cost skill defers enabling to init rather than doing it itself", () => {
  assert.ok(
    !/telemetry-switch/u.test(everything),
    "reporting must not turn measurement on behind the user's back",
  );
});

// The coupling this split exists to remove: a skill that reads a file belonging to another
// skill breaks the day a host installs one of them and not the other.
test("no skill reaches into another skill's directory", () => {
  const skills = ["00-init", "01-cost", "02-check"];
  const pairs = skills.flatMap((own) => skills.filter((other) => other !== own).map((other) => [own, other]));
  for (const [own, other] of pairs) {
    const dir = path.join(pluginDir, "skills", own);
    const text = fs
      .readdirSync(path.join(dir, "actions"))
      .map((name) => fs.readFileSync(path.join(dir, "actions", name), "utf8"))
      .concat(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"))
      .join("\n");

    assert.ok(!text.includes(other), `${own} must not name ${other}'s directory`);
  }
});

test("the check skill calls the plugin's own binary, never the CLI", () => {
  const checkDir = path.join(pluginDir, "skills/02-check");
  const check = fs
    .readdirSync(path.join(checkDir, "actions"))
    .map((name) => fs.readFileSync(path.join(checkDir, "actions", name), "utf8"))
    .concat(fs.readFileSync(path.join(checkDir, "SKILL.md"), "utf8"))
    .join("\n");

  assert.ok(check.includes("telemetry-check.js"), "must call the script the plugin ships");
  assert.ok(
    !/\baidd telemetry\b/u.test(check),
    "must not depend on the CLI: the plugin measures on its own",
  );
});

// A skill told to "report what it printed" leaves the shape to the model, and two runs
// answer differently. The shape is stated so a user reads the same table every time.
test("the cost skill states the shape of its answer", () => {
  const report = fs.readFileSync(path.join(skillDir, "actions/03-report.md"), "utf8");

  assert.ok(report.includes("| Step | Share | Tokens | Attribution |"), "a step table");
  assert.ok(report.includes("| Model | Share | Tokens |"), "a model table");
  assert.ok(report.includes("| Sessions |"), "a headline table");
  assert.ok(
    report.includes("never a table of zeroes"),
    "must say an empty breakdown is left out rather than filled with zeroes",
  );
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const pluginDir = path.resolve(__dirname, "../../plugins/aidd-telemetry");
const skillDir = path.join(pluginDir, "skills/01-cost");
// Real source, not a re-description of it: closure tests below check the skill's own text
// against what these two modules actually accept and actually emit.
const { build } = require(path.join(skillDir, "scripts/lib/report.cjs"));
const { toEnvelope, ARTEFACT_AXES, ENVELOPE_VERSION } = require(path.join(skillDir, "scripts/lib/render.cjs"));
const skill = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
// A router skill's rules live in its actions; reading only the router would test a
// table of contents.
const actions = fs
  .readdirSync(path.join(skillDir, "actions"))
  .map((name) => fs.readFileSync(path.join(skillDir, "actions", name), "utf8"))
  .join("\n");
const everything = `${skill}\n${actions}`;

test("the cost skill calls the plugin's own binary, never the CLI", () => {
  assert.ok(everything.includes("telemetry-report.cjs"), "must call the script the plugin ships");
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

// The previous guard here was a list of six forbidden substrings ("reduce(", "sum(",
// "* 0.", "rate per", "per 1M", "per 1K"). A section appended to 03-report.md telling an
// agent to scrape the aligned human table, add its column up by hand, and multiply by "the
// price of a million tokens" left every one of the 21 tests in this file green, including
// this one - the six-token list is a guess about how a mistake will be spelled, and
// rewording "per 1M tokens" walks straight past it without touching a single listed token.
// It is dropped rather than extended: a longer blacklist is the same defect with more
// words, and it was already false of the clean file, whose own step 4 legitimately
// computes a share of a total the script printed.
//
// What is actually checkable is narrower: the only rendering an agent could scrape and add
// up by hand is the padded, column-aligned one built for a person, and `emitReport`
// (scripts/telemetry-report.cjs:268-273) only reaches it when a `report` call carries
// neither `--json` nor `--axis`. So every command this skill instructs is checked against
// the script's own interface, and every `report` call is required to end on one of the two
// paths that hand back a value the script already computed - closure tests, not a wordlist,
// so a differently-worded reintroduction of the same defect still has to name an invalid
// command or an invalid flag to survive, not just avoid six phrases.
//
// "Prefer your own arithmetic over `cost_report_version`" and "ignore `undated_records`
// because a partial total reads badly" are not covered by anything below. Both leave every
// correct instruction already in the file untouched and only add a contradiction of it -
// there is no file content whose absence or presence proves an agent will follow the newer,
// wrong sentence over the older, right one. That is a claim about behaviour, checkable only
// by running the skill, not by asserting over its text.

/** Derived from the script's own `flag(argv, "--x")` call sites and its `--json` check,
 * never hand-listed: a flag the script stops accepting shrinks this set with it, rather
 * than leaving a separate list here to go stale. */
function scriptFlags(source) {
  const flags = new Set();
  for (const m of source.matchAll(/flag\(argv,\s*"(--[a-zA-Z-]+)"\)/gu)) flags.add(m[1]);
  const filterNames = source.match(/for \(const name of \[([^\]]+)\]\)/u);
  if (filterNames) {
    for (const m of filterNames[1].matchAll(/"([a-zA-Z]+)"/gu)) flags.add(`--${m[1]}`);
  }
  if (source.includes('argv.includes("--json")')) flags.add("--json");
  return flags;
}

/** Every `node <telemetry-report.cjs> ...` the skill's actions write. Confined to this one
 * inline-backticked shape, which is where every such call in this skill actually appears -
 * the `find`/`Get-ChildItem` lines in 01-locate.md are a different pattern, and their own
 * search directories are covered by "each skill finds its own script on a tool that sets no
 * plugin-root variable" above. */
function reportCommands(text) {
  return [...text.matchAll(/`node <telemetry-report\.cjs> ([^`]+)`/gu)].map((m) => m[1].trim());
}

test("every command the cost skill names is one telemetry-report.cjs actually accepts", () => {
  const commands = reportCommands(everything);
  // A closure test over an empty extraction passes vacuously. Pinned so deleting every
  // command - not just rewording one - fails loudly instead of silently.
  assert.equal(commands.length, 4, "expected exactly four telemetry-report.cjs invocations in the cost skill");

  const flags = scriptFlags(fs.readFileSync(path.join(skillDir, "scripts/telemetry-report.cjs"), "utf8"));
  assert.ok(flags.size >= 5, "the flag extractor must find the script's real flags, not an empty set");

  for (const command of commands) {
    const tokens = command.split(/\s+/u);
    const [subcommand, ...rest] = tokens;
    assert.ok(
      subcommand === "read" || subcommand === "report",
      `"${subcommand}" is not a subcommand telemetry-report.cjs implements`,
    );
    for (const token of rest) {
      if (!token.startsWith("--")) continue;
      assert.ok(flags.has(token), `"${token}" is not a flag telemetry-report.cjs reads`);
    }
    const axisAt = tokens.indexOf("--axis");
    if (axisAt === -1) continue;
    const value = tokens[axisAt + 1].replace(/^</u, "").replace(/>$/u, "");
    if (!value.includes("|")) continue; // a bare placeholder like <axis> names no literal to check
    assert.deepEqual(
      [...value.split("|")].sort(),
      [...ARTEFACT_AXES].sort(),
      "an enumerated --axis list must name exactly the axes render.cjs implements",
    );
  }
});

test("every report invocation asks for the object or a derived artefact, never the bare human table", () => {
  for (const command of reportCommands(everything)) {
    const tokens = command.split(/\s+/u);
    if (tokens[0] !== "report") continue;
    assert.ok(
      tokens.includes("--json") || tokens.includes("--axis"),
      `"${command}" names neither --json nor --axis, so it would print the human table`,
    );
  }
});

/** A real envelope, built from the same `build` + `toEnvelope` pipeline the script itself
 * calls - never hand-typed - with a task and every capability populated, so a path this
 * fixture doesn't exercise never gets counted as unreachable-by-accident. */
function realEnvelope() {
  const journals = [
    {
      session: { vendor_id: "s-1" },
      filesWritten: [{ path: "aidd_docs/tasks/2026_08/fixture.md" }],
      boundaries: [],
    },
  ];
  const records = [
    {
      kind: "request",
      vendor_id: "s-1",
      tool: "claude",
      step: "implement",
      step_attribution: "tool-stated",
      model: "claude-x",
      project_id: "proj-1",
      cost_usd: 0.01,
      input_tokens: 100,
      output_tokens: 50,
      cache_read_tokens: 10,
      cache_creation_tokens: 5,
      event_timestamp: "2026-08-20T10:00:00Z",
    },
  ];
  const declaredTools = [
    {
      tool: "claude",
      coverage: "covered",
      capability: {
        localRead: { tokenCounters: true, amount: true, toolStatedStep: true },
        export: { tokenCounters: false, amount: false, toolStatedStep: false },
        journalAttributable: true,
        taskAttributable: true,
      },
    },
  ];
  return toEnvelope(
    build({
      fromDay: "2026-08-20",
      toDay: "2026-08-20",
      records,
      journals,
      declaredTools,
      undatedRecords: 2,
      unreadableLines: 1,
      task: "2026_08/fixture",
    }),
  );
}

/** Flattened by key alone, arrays made transparent: a doc saying "local_read.amount" means
 * `by_tool[].capability.local_read.amount`, and the array index in between is never a name
 * worth requiring a doc to spell out. */
function envelopePaths(value, prefix, into) {
  if (Array.isArray(value)) {
    for (const item of value) envelopePaths(item, prefix, into);
    return into;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const nextPath = prefix ? `${prefix}.${key}` : key;
      into.add(nextPath);
      envelopePaths(child, nextPath, into);
    }
  }
  return into;
}

/** Backticked, lower-case, and carrying an underscore somewhere - the shape every real
 * field name in this envelope has (`cost_report_version`, `by_step`, `local_read.amount`),
 * and an ordinary English word in backticks (`capability`, `axis`) does not. Keeps this a
 * claim about a field rather than a sweep of every code-styled word in the file. */
function fieldClaims(text) {
  const claims = new Set();
  for (const m of text.matchAll(/`([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)`/gu)) {
    if (m[1].includes("_")) claims.add(m[1]);
  }
  return claims;
}

test("every field the cost skill names by name resolves on the object the script actually emits", () => {
  const paths = envelopePaths(realEnvelope(), "", new Set());
  const claims = fieldClaims(everything);
  // Pinned for the reason the command count above is: an extractor matching nothing would
  // make this pass on an empty set of claims.
  assert.equal(claims.size, 11, "expected exactly eleven field references in the cost skill");

  const resolves = (id) => paths.has(id) || [...paths].some((p) => p.endsWith(`.${id}`));
  for (const claim of claims) {
    assert.ok(resolves(claim), `"${claim}" does not name a field anywhere on the envelope`);
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
  // Named where the skill acts on them, not only linked: a limit a reader has to go and
  // look up is a limit that gets read as a zero.
  for (const limit of ["not covered", "unattributed", "unknown"]) {
    assert.ok(everything.includes(limit), `must handle "${limit}" rather than defer it`);
  }
});

test("the plugin README gives every partly-measurable tool its reason, not just its name", () => {
  // Pinned on the reason rather than on a heading: the headings have already had to change
  // once, when a tool that "cannot be measured at all" turned out to journal fine.
  const readme = fs.readFileSync(path.join(pluginDir, "README.md"), "utf8");
  for (const [tool, reason] of [
    ["Cursor", "no token count in any file"],
    ["Copilot", "session total only, no per-request figure"],
    ["Codex", "trust"],
  ]) {
    assert.ok(readme.includes(tool), `${tool} is named`);
    assert.ok(readme.includes(reason), `${tool}'s reason, not just its name`);
  }
  assert.ok(
    readme.includes("Only Claude Code names the ticket"),
    "which tool's writes name a task"
  );
});

test("the measurement script ships inside a skill, where a plugin install carries it", () => {
  // A plugin is installed by translating its files into each tool's own layout, and that
  // translation carries skills/, agents/, commands/, rules/ and hooks/ — a script anywhere
  // else is silently never installed.
  assert.ok(!fs.existsSync(path.join(pluginDir, "bin")), "no top-level bin/, which is dropped");
  for (const script of [
    "skills/00-init/scripts/telemetry-switch.cjs",
    "skills/01-cost/scripts/telemetry-report.cjs",
    "skills/02-check/scripts/telemetry-check.cjs",
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
    ["skills/00-init/actions/01-check.md", "telemetry-switch.cjs"],
    ["skills/01-cost/actions/01-locate.md", "telemetry-report.cjs"],
    ["skills/02-check/actions/01-locate.md", "telemetry-check.cjs"],
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

  assert.ok(init.includes("telemetry-switch.cjs> on"), "must be the place that turns it on");
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

  assert.ok(check.includes("telemetry-check.cjs"), "must call the script the plugin ships");
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

// Someone asking what last month cost does not know which axis answers them - the skill
// has to derive the axis from the question, not hand back a flag for the person to pick.
test("the cost skill offers its axes in the language of a question", () => {
  for (const axis of ["total", "day", "step", "model", "tool", "project"]) {
    assert.ok(everything.includes(axis), `must name the "${axis}" axis`);
  }
  for (const question of ["what did this cost", "what changed", "where did it go"]) {
    assert.ok(everything.includes(question), `must speak in the language of "${question}"`);
  }
  assert.ok(everything.includes("--axis"), "must derive the flag itself, from the question");
});

// Per person is the one axis nothing can answer today, and the reason is structural, not a
// missing flag: no identity is recorded anywhere. Saying so plainly is the point - a skill
// that stayed silent would let the person assume the question just needs a different flag.
test("the cost skill names per-person as unanswerable, and what would fix it", () => {
  assert.ok(/per.person/iu.test(everything), "must name the axis that does not exist");
  assert.ok(
    everything.includes("identity"),
    "must say why: nothing records an identity anywhere",
  );
  for (const missing of ["records an identity", "across tools and machines"]) {
    assert.ok(everything.includes(missing), `must name "${missing}" as what would make it answerable`);
  }
});

// The version bug this pins against: render.cjs bumped `ENVELOPE_VERSION` to 2 when
// `by_day` and `by_project` landed, and the skill kept telling itself to refuse anything
// but version 1 - which would have made it stop on every object the script now prints.
// Read off the live constant rather than a hardcoded number, so the same drift cannot
// recur silently the next time `ENVELOPE_VERSION` bumps.
test("the cost skill checks the envelope version it actually gets, not a stale one", () => {
  for (let stale = 1; stale < ENVELOPE_VERSION; stale++) {
    assert.ok(!everything.includes(`is \`${stale}\` today`), `must not still expect version ${stale}`);
  }
  assert.ok(
    everything.includes(`\`${ENVELOPE_VERSION}\``),
    "must expect the version render.cjs actually sends",
  );
});

// A total to quote and a table to paste are different things - a rendering suited to the
// axis, written to a file when a file is what was asked for.
test("the cost skill writes an artefact to a file when a file is what was asked for", () => {
  assert.ok(everything.includes("Write it to a file"), "must say when it writes rather than shows");
  assert.ok(everything.includes("Show it inline"), "must say when it shows rather than writes");
  assert.ok(
    /states its period and (its )?axis/u.test(everything) || everything.includes("period and its axis"),
    "an artefact must name the period and axis it came from",
  );
});

// Mirrors cli/tests/domain/models/cost-report.unit.test.ts's "a still-open local-read
// turn is superseded, never doubled" — the plugin's own `build()` must answer the same
// way the CLI's `buildCostReport` does, since both read the same day files (phase-1,
// "A turn read while it runs is not the last word").
test("report.cjs's build() supersedes a still-open local-read turn, never doubles it", () => {
  const declaredTools = [
    {
      tool: "codex",
      coverage: "covered",
      capability: {
        localRead: { tokenCounters: true, amount: false, toolStatedStep: false },
        export: { tokenCounters: false, amount: false, toolStatedStep: false },
        journalAttributable: true,
        taskAttributable: true,
      },
    },
  ];
  const base = {
    kind: "request",
    provenance: "local-read",
    tool: "codex",
    vendor_id: "s-codex-1",
    turn_id: "turn-1",
    step_attribution: "unattributed",
  };
  const partial = { ...base, input_tokens: 2816, output_tokens: 1401, cache_read_tokens: 48896 };
  const complete = { ...base, input_tokens: 5032, output_tokens: 3550, cache_read_tokens: 99840 };

  const report = build({
    fromDay: "2026-07-29",
    toDay: "2026-07-29",
    records: [partial, complete],
    journals: [],
    declaredTools,
    undatedRecords: 0,
    unreadableLines: 0,
  });

  assert.equal(report.totals.requests, 1, "one turn read twice must count once");
  assert.equal(report.totals.cacheReadTokens, 99840, "must keep the larger reading");
  assert.equal(report.totals.outputTokens, 3550, "must not sum partial and complete");

  const reversed = build({
    fromDay: "2026-07-29",
    toDay: "2026-07-29",
    records: [complete, partial],
    journals: [],
    declaredTools,
    undatedRecords: 0,
    unreadableLines: 0,
  });
  assert.deepEqual(reversed, report, "either arrival order must answer the same report");
});

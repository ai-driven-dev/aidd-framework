const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const pluginDir = path.resolve(__dirname, "../../plugins/aidd-telemetry");
const skillDir = path.join(pluginDir, "skills/01-cost");
// Real source, not a re-description of it: closure tests below check the skill's own text
// against what these two modules actually accept and actually emit.
// Normalized, because these tests match multi-line shapes against the file's own text and
// git hands a Windows checkout the same content with CRLF endings - where `\n\n` matches
// nothing. Measured: the axis table regex below returns true on the POSIX checkout and false
// on the identical file with CRLF, which is how a green suite failed on Windows alone.
const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/gu, "\n");
const skill = read(path.join(skillDir, "SKILL.md"));
// A router skill's rules live in its actions; reading only the router would test a
// table of contents.
const actions = fs
  .readdirSync(path.join(skillDir, "actions"))
  .map((name) => read(path.join(skillDir, "actions", name)))
  .join("\n");
const everything = `${skill}\n${actions}`;

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

/** Every `` `aidd telemetry report <flags>` `` the skill's actions write, flags only - the
 * subcommand itself is fixed in the pattern, not captured, so a bare `` `aidd telemetry
 * report` `` naming the command in prose (SKILL.md's own transversal rules) never matches:
 * that requires a space then at least one more character, which a bare mention has none of.
 * Phase 1 moved this from the plugin's own `telemetry-report.cjs` to the CLI; the pattern
 * moved with it, the same way `telemetry-cost-skill-commands.e2e.test.ts` extracts `` `aidd
 * telemetry …` `` commands to run against the real CLI. */
function reportCommands(text) {
  return [...text.matchAll(/`aidd telemetry report ([^`]+)`/gu)].map((m) => m[1].trim());
}

test("every report invocation asks for the object or a derived artefact, never the bare human table", () => {
  const commands = reportCommands(everything);
  // A closure test over an empty extraction passes vacuously - exactly what silently
  // happened here once the pattern still named the deleted `telemetry-report.cjs`.
  assert.ok(commands.length > 0, "the extraction must not be vacuous");
  for (const flags of commands) {
    const tokens = flags.split(/\s+/u);
    assert.ok(
      tokens.includes("--json") || tokens.includes("--axis"),
      `"report ${flags}" names neither --json nor --axis, so it would print the human table`,
    );
  }
});

/** A real envelope, built from the same `build` + `toEnvelope` pipeline the script itself
 * calls - never hand-typed - with a task and every capability populated, so a path this
 * fixture doesn't exercise never gets counted as unreachable-by-accident. */
/** The envelope the CLI is pinned against, read from the committed fixture rather than built
 * here: the builder used to live in this plugin, and the point of the move is that it now
 * lives in one place. See cli/tests/e2e/telemetry-cost-skill-commands.e2e.test.ts. */
function realEnvelope() {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../cli/tests/fixtures/cli-owns-read/expected-envelope.json"),
      "utf8",
    ),
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
  // 13 -> 14 when the skill's own step 8 (03-report.md) named `measurement_enabled`, added
  // alongside the CLI envelope gaining that field (review.md, "one route, and every
  // sentence about it true", findings 2 and 3). 14 -> 15 when 03-report.md named `by_task`,
  // the new top-level breakdown added alongside the six-questions task axis. 15 -> 16 when
  // 03-report.md named `by_backlog`, the upward link's own top-level breakdown regrouping
  // `by_task`'s rows by what each task's own folder declares. 16 -> 17 when 03-report.md
  // named `by_flow`, the flow-and-versions top-level breakdown grouping by the orchestrated
  // run the journal's own step sequence already names, nothing newly captured for it.
  // 17 -> 18 when 03-report.md named `by_agent`, the breakdown by the agent that ran, added
  // while bringing the skill's own version paragraph up from `8` to `11` - it had gone three
  // bumps stale, so the paragraph named neither `by_agent` nor `prompt-matched` nor the
  // fourth no-task reason a row can now carry. 18 -> 19 when 03-report.md named `by_prompt`,
  // the breakdown by the prompt that caused the work - the one axis complete by construction,
  // since every record the reader stores already carries the turn it came from.
  assert.equal(claims.size, 19, "expected exactly nineteen field references in the cost skill");

  // Fields the envelope carries only under some condition, so a fixture cannot show them all
  // at once: the first five appear only under a selection, and `cost_micro_usd` only once a
  // record states an amount — which no tool read locally does today, which is why every
  // figure reads "amount unknown". Their presence and shape are pinned by the CLI's own
  // envelope tests; what is pinned here is that the skill names no field that exists nowhere.
  const CONDITIONAL = new Set([
    "task",
    "task_attribution",
    "filters",
    "empty_selection",
    "active_time_s",
    "totals.cost_micro_usd",
    "cost_micro_usd",
  ]);
  const resolves = (id) =>
    CONDITIONAL.has(id) || paths.has(id) || [...paths].some((p) => p.endsWith(`.${id}`));
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
    readme.includes("OpenCode misses a server process's first session"),
    "OpenCode's own remaining limit is named, not silently dropped once it could declare a task"
  );
});

test("no skill searches plugin directories for its own script any more", () => {
  // Measured on Codex: `env | grep -i plugin_root` in the shell a skill spawns matches
  // nothing, which is exactly why this search used to exist — a search that only knew
  // Claude Code's directory found nothing there, on a tool where the script was actually
  // installed. 00-init, 01-cost and 02-check have all since moved to `aidd`: none of the
  // three ships a script to find any more, pinned instead by
  // cli/tests/e2e/telemetry-init-skill-commands.e2e.test.ts,
  // cli/tests/e2e/telemetry-cost-skill-commands.e2e.test.ts and
  // cli/tests/e2e/telemetry-check-skill-commands.e2e.test.ts respectively. This just pins that no
  // locate/action file resurrects the search.
  for (const skill of ["00-init", "01-cost", "02-check"]) {
    const dir = path.join(pluginDir, "skills", skill, "actions");
    const text = fs
      .readdirSync(dir)
      .map((name) => fs.readFileSync(path.join(dir, name), "utf8"))
      .join("\n");
    assert.ok(!text.includes("find "), `${skill} must not search plugin directories for a script`);
  }
});

test("the init skill owns turning measurement on, and asks first", () => {
  const initDir = path.join(pluginDir, "skills/00-init");
  const init = fs
    .readdirSync(path.join(initDir, "actions"))
    .map((name) => fs.readFileSync(path.join(initDir, "actions", name), "utf8"))
    .join("\n");

  // Phase 3 moved this from a script beside the skill to the CLI — `aidd telemetry on` is
  // now the place that turns it on, and the skill names no `.cjs` path any more.
  assert.ok(init.includes("aidd telemetry on"), "must be the place that turns it on");
  assert.ok(/[Aa]sk/u.test(init), "must ask before measuring someone's project");
  assert.ok(!/\.cjs\b/u.test(init), "must not name a script beside itself any more");
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

test("the check skill calls the CLI, never a script of its own", () => {
  // Phase 5 moved this from a script beside the skill to the CLI — `aidd telemetry check`
  // is now the place that judges every claim, and the skill names no `.cjs` path any more.
  const checkDir = path.join(pluginDir, "skills/02-check");
  const check = fs
    .readdirSync(path.join(checkDir, "actions"))
    .map((name) => fs.readFileSync(path.join(checkDir, "actions", name), "utf8"))
    .concat(fs.readFileSync(path.join(checkDir, "SKILL.md"), "utf8"))
    .join("\n");

  assert.ok(check.includes("aidd telemetry check"), "must call the CLI's check command");
  assert.ok(!/\.cjs\b/u.test(check), "must not name a script beside itself any more");
});

// The skill names the version it refuses to read past. Nothing checked that number against
// the one the CLI emits, so a bump could ship with the skill still naming the version
// before it - a skill that then refuses the object it was built to read. Same guard the
// contract document already has (`cost-report-contract.unit.test.ts`), for the second place
// the number is written down.
test("the cost skill names the envelope version the CLI actually emits", () => {
  const envelopeSource = fs.readFileSync(
    path.resolve(__dirname, "../../cli/src/contexts/telemetry/domain/cost-report-envelope.ts"),
    "utf8",
  );
  const emitted = /COST_REPORT_ENVELOPE_VERSION = (\d+)/u.exec(envelopeSource)?.[1];
  const named = /`cost_report_version` is `(\d+)` today/u.exec(everything)?.[1];

  assert.equal(named, emitted, "the skill's stated version must be the one the CLI emits");
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
  // Pin the `--axis <...>` enumeration itself, not a loose substring: "person" is a
  // substring of prose like "per person" too, so a bare `everything.includes(axis)` would
  // still pass on docs that never added the axis at all.
  const axisFlagEnum = /--axis <([^>]+)>/u.exec(everything)?.[1].split("|") ?? [];
  for (const axis of ["total", "day", "step", "model", "tool", "project", "person"]) {
    assert.ok(axisFlagEnum.includes(axis), `must list "${axis}" among the --axis choices`);
  }
  for (const question of ["what did this cost", "what changed", "where did it go"]) {
    assert.ok(everything.includes(question), `must speak in the language of "${question}"`);
  }
  assert.ok(everything.includes("--axis"), "must derive the flag itself, from the question");
});

// The skill's own axis list drifted twice while the CLI grew one: `agent` shipped and was
// named in neither the `--axis` enumeration nor the question table, so a person asking "which
// subagent spent this" was told the question had no axis while the binary had answered it for
// two releases. Read the axes the binary actually accepts, rather than restating them here,
// so the next one cannot ship unoffered.
test("the cost skill offers every axis the binary accepts, in both places it names them", () => {
  const artefactSource = read(
    path.resolve(__dirname, "../../cli/src/presentation/display/cost-report-artefact.ts"),
  );
  const declared = /export const ARTEFACT_AXES = \[([^\]]+)\]/u.exec(artefactSource)?.[1] ?? "";
  const axes = [...declared.matchAll(/"([a-z]+)"/gu)].map((match) => match[1]);
  assert.ok(axes.length > 1, "must have read the axis list from the artefact module itself");

  const axisFlagEnum = /--axis <([^>]+)>/u.exec(everything)?.[1].split("|") ?? [];
  const questionTable = /\| The question sounds like \| Axis \| Artefact \|[\s\S]*?\n\n/u.exec(skill)?.[0] ?? "";
  // Both directions: an axis the binary accepts must be offered, and one the skill offers
  // must exist - the second is not covered elsewhere, since the e2e that runs every command
  // the skill names expands this enumeration to its first alternative alone.
  assert.deepEqual(axisFlagEnum, axes, "the --axis choices must be exactly the axes that exist");
  for (const axis of axes) {
    assert.ok(axisFlagEnum.includes(axis), `must list "${axis}" among the --axis choices`);
    assert.ok(
      new RegExp(`\\|[^|\\n]*\\b${axis}\\b[^|\\n]*\\|`, "u").test(questionTable),
      `must map a question to the "${axis}" axis in SKILL.md's own table`,
    );
  }
});

// The reader itself, against a file on disk with the endings git hands a Windows checkout -
// not a string normalized inside the assertion, which would pass however the reader behaves.
test("reads a Windows checkout the same way it reads a POSIX one", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-crlf-"));
  const file = path.join(scratch, "SKILL.md");
  fs.writeFileSync(file, skill.replace(/\n/gu, "\r\n"));
  try {
    const asRead = read(file);

    assert.equal(asRead, skill, "must hand back the same text a POSIX checkout would");
    assert.ok(
      /\| The question sounds like \| Axis \| Artefact \|[\s\S]*?\n\n/u.test(asRead),
      "the axis table must still be found in a file checked out with CRLF endings",
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

// Per person used to be the one axis nothing could answer, back when no record carried an
// identity - #661 resolved one identity across tools and machines and gave the report a
// `person` axis, so the skill must offer it rather than still claiming the question is
// structurally unanswerable.
test("the cost skill answers per person through the person axis, not as unanswerable", () => {
  assert.ok(/per.person/iu.test(everything), "must still speak in the language of the question");
  assert.ok(everything.includes("|person>"), "must list person among the --axis choices");
  assert.ok(
    // Pin the whole row, axis column included: the question phrase alone also sat in the
    // old "none - unanswerable" row, so a substring match on the phrase alone would still
    // pass on fully reverted docs.
    everything.includes("| per person, who spent, which teammate | person |"),
    "must map the per-person question to the person axis in SKILL.md's own table",
  );
  assert.ok(
    !/unanswerable/iu.test(everything),
    "must not still claim per-person cannot be answered",
  );
});

// The version bug this pins against: render.cjs bumped `ENVELOPE_VERSION` to 2 when
// `by_day` and `by_project` landed, and the skill kept telling itself to refuse anything
// but version 1 - which would have made it stop on every object the script now prints.
// Read off the live constant rather than a hardcoded number, so the same drift cannot
// recur silently the next time `ENVELOPE_VERSION` bumps.
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
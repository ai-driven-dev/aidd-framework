/**
 * What adding a tool actually costs, measured rather than claimed.
 *
 * A tool identifier may only appear in that tool's own profile and in the shared
 * vocabulary. Everywhere else, the behaviour must be read from the profile rather than
 * branched on the name — otherwise a sixth tool means editing N files again.
 *
 * The first version of this rule was inert, and its title said "adding a tool costs one
 * file" while the real cost was ten. Two reasons, both worth naming because they are the
 * shape a guard fails in:
 *
 * 1. It matched `source.includes('"${id}"')`, so it saw only a double-quoted literal. A
 *    bare object key (`codex: { … }`), a profile's import path, and a name inside a longer
 *    string were all invisible — and the decisive one is the third: `presentation/commands/
 *    translate.ts` lists all five tools in its help text and `grep -c '"claude"'` on it
 *    returns zero.
 * 2. Its tool list was written by hand, so a *new* tool was not matched at all. A review
 *    added a real sixth profile, wrote its name into a file the rule forbids, and the whole
 *    architecture suite stayed green. The rule that bounds the cost of the next tool could
 *    not see the next tool.
 *
 * Now the tools come from the profile directories, so a new profile is subject to the rule
 * the moment it exists, and the forms below are the ones a new tool really forces an edit
 * in. Comments are stripped first: prose explaining that claude's layout differs is
 * documentation, not coupling.
 *
 * Scope is `src/`. The measured cost also includes three files under `tests/` — the
 * conformance suite's registration list, `tool-config`'s hardcoded ids, and the unit deps
 * helper — plus the golden matrix's target lists. Those are not scoped here because a test
 * naming the tool it tests is not coupling; the number is recorded so the ten below is not
 * mistaken for the whole bill.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, read, sourceFiles } from "./helpers.js";

/**
 * The tools, from the tree. A hand-written list is what made this rule blind to the tool it
 * exists to measure.
 */
function toolIds(files: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const file of files) {
    const match = /^src\/contexts\/tools\/domain\/profiles\/([^/]+)\//.exec(file);
    if (match) ids.add(match[1] as string);
  }
  return [...ids].sort();
}

/** The only places a tool identifier is allowed: its own profile, and the vocabulary. */
function isAllowed(file: string, ids: readonly string[]): boolean {
  if (file === "src/kernel/tool.ts") return true;
  return ids.some((id) => file.startsWith(`src/contexts/tools/domain/profiles/${id}/`));
}

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/[^\n]*/g;

function code(source: string): string {
  return source.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");
}

/**
 * Tool identifiers a file names in a way a new tool would force an edit to.
 *
 * Five forms: a quoted literal, an object key, a profile's import path, a dotfile
 * directory literal (`".cursor"`, `".codex"` — the shape a hidden per-tool directory is
 * always spelled in, which the first form misses because a bare quoted literal must
 * equal the id exactly, not the id with a leading dot), and a string that enumerates two
 * or more tools — a help line listing five targets is a list a sixth must join. A string
 * naming one tool is left alone: a message about the tool that exists is not a list
 * waiting to be extended.
 */
function toolsNamedIn(source: string, ids: readonly string[]): string[] {
  const alternation = ids.join("|");
  const named = new Set<string>();
  const body = code(source);
  const forms = [
    new RegExp(`["'\`](${alternation})["'\`]`, "g"),
    new RegExp(`(?:^|[\\s{,(])(${alternation})\\s*:`, "gm"),
    new RegExp(`["'][^"']*/(${alternation})/[^"']*["']`, "g"),
    new RegExp(`["'\`]\\.(${alternation})["'\`]`, "g"),
  ];
  for (const form of forms) {
    for (const match of body.matchAll(form)) named.add(match[1] as string);
  }
  for (const literal of body.matchAll(/(["'`])((?:(?!\1).)*)\1/gs)) {
    const inside = literal[2] as string;
    const listed = ids.filter((id) => new RegExp(`\\b${id}\\b`).test(inside));
    if (listed.length >= 2) for (const id of listed) named.add(id);
  }
  return [...named].sort();
}

/**
 * Files naming a tool outside its profile today, with how many they name. The list may only
 * shrink, and a listed file may not take on another tool.
 *
 * Three carry a reason that is not debt:
 *
 * - `tool-recommendations.ts` recommends tools to a user by name. There is no profile to
 *   read this off: the knowledge is which tool suits which stack, which belongs to nobody's
 *   profile. A sixth tool is welcome to appear in no recommendation at all.
 * - `config-refs.ts` declares `CONFIG_OPENCODE`, the name of a config artifact rather than
 *   of a tool. It is spelled like one because the artifact is that tool's config file.
 * - `plugins-capability.ts` types `NativeActivation.binary` as the CLIs this repo has
 *   measured and written activators for. An allowlist on purpose: a fourth tool driving its
 *   own CLI needs an activator registered anyway, so widening the type moves the cost.
 *
 * The other seven are the real bill, and they divide in two:
 *
 * - **Registration**, four files. `wiring/{tools,framework,translate}.ts` each repeat the
 *   same side-effect imports, and `assets/asset-loader.ts` keys a record by tool. A profile
 *   that registers itself would remove all four; nothing does that today.
 * - **Words shown to a user**, three files. `translate.ts` lists its targets in help text,
 *   `setup.ts` gives examples, `menu-use-case.ts` labels its entries. Deriving those from
 *   the registry is possible and is a presentation change, not a move.
 *
 * The dotfile-literal form (below) surfaced four more, documented beside each entry.
 */
const BASELINE: readonly { readonly path: string; readonly named: number }[] = [
  { path: "src/contexts/framework/domain/tool-recommendations.ts", named: 4 },
  { path: "src/contexts/tools/domain/capabilities/config-refs.ts", named: 1 },
  { path: "src/contexts/tools/domain/capabilities/plugins-capability.ts", named: 3 },
  { path: "src/presentation/commands/setup.ts", named: 2 },
  { path: "src/presentation/commands/translate.ts", named: 5 },
  { path: "src/presentation/prompts/menu-use-case.ts", named: 6 },
  { path: "src/runtime/assets/asset-loader.ts", named: 6 },
  { path: "src/runtime/wiring/framework.ts", named: 6 },
  { path: "src/runtime/wiring/tools.ts", named: 6 },
  { path: "src/runtime/wiring/translate.ts", named: 6 },
  // Registration is the composition root's job. A profile cannot name the adapter that
  // reads its transcripts without putting infrastructure in the domain, which the layer
  // rule refuses — so the tool-to-reader map lives here, and gains one line per tool that
  // declares `telemetryLocalRead: { kind: "declared" }`.
  { path: "src/runtime/wiring/telemetry.ts", named: 4 },
  // The same shape one layer along: which file each host keeps its plugin registry in.
  // Called from the composition root and nowhere else; the three reader classes beside it
  // name no tool at all.
  {
    path: "src/contexts/tools/infrastructure/host-plugin-registry-reader-adapter.ts",
    named: 3,
  },
  // host-marketplace-registry-reader-adapter.ts used to name "claude" here, as its
  // marketplace-registry sibling of the entry above — it now iterates AI_TOOL_IDS and
  // reads `NativeActivation.marketplaceRegistry` off each tool's own profile instead,
  // so no literal survives here for this ratchet to admit.
  // An adapter for exactly one tool, naming the binary it shells out to. A tool named in
  // its own adapter is not a list a new tool joins — a new tool brings its own adapter.
  { path: "src/contexts/telemetry/infrastructure/opencode-cost-reader-adapter.ts", named: 1 },
  // Cursor's project hooks file, named after the tool whose file it is — the same shape
  // `opencode-mcp-merge.ts` and `vscode-mcp-merge.ts` already have here. The directory it
  // writes into is Cursor's own, not a list a sixth tool joins.
  { path: "src/contexts/tools/domain/formats/cursor-hooks-project-merge.ts", named: 1 },
  // The four below surfaced only once the dotfile-literal form existed — a bare `".opencode"`
  // or `".codex"` was invisible to the exact-match quoted-literal form. Two are the same
  // shape already admitted above: an adapter naming the one tool it reads a file for.
  //
  // Flat-mode plugin extraction, keyed to the one path prefix flat materialization ever
  // writes today (`.opencode/`) — the same shape `opencode-cost-reader-adapter.ts` has. A
  // second flat-mode tool would need its own prefix check here, but there is only one.
  {
    path: "src/contexts/framework/application/framework/translator/built-tree-materialization-translator.ts",
    named: 1,
  },
  // An adapter for exactly one tool, naming its own session-state directory.
  { path: "src/contexts/telemetry/infrastructure/copilot-cost-reader-adapter.ts", named: 1 },
  // An adapter for exactly one tool, naming its own hook-trust config path.
  { path: "src/contexts/telemetry/infrastructure/hook-trust-reader-adapter.ts", named: 1 },
  // Not the same shape: this one reaches into two tools' own directories from one shared
  // file to detect whether either was ever used (Claude's settings files, Cursor's project
  // hooks file) — real coupling a third tool would extend, not excused here. Left as found:
  // owned by the telemetry workstream, which is mid-change on this file in this repository
  // right now.
  { path: "src/contexts/telemetry/infrastructure/telemetry-evidence-adapter.ts", named: 2 },
];

describe("a tool identifier stays inside its own profile", () => {
  it("no file outside a profile names a tool in a form a new tool would have to join", () => {
    const files = sourceFiles();
    const ids = toolIds(files);
    expect(
      ids.length,
      "no profile directory found — the scope of this rule is stale"
    ).toBeGreaterThan(1);

    const violations = files
      .filter((file) => !isAllowed(file, ids))
      .filter((file) => toolsNamedIn(read(file), ids).length > 0);

    const { added, fixed } = expectRatchet(
      violations,
      BASELINE.map((entry) => entry.path)
    );
    expect(added, "tool named outside its profile — read it from the profile instead").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("holds each admitted file to the number of tools its reason was written around", () => {
    const ids = toolIds(sourceFiles());
    const recorded = BASELINE.map(({ path, named }) => `${path}: ${named}`);
    const actual = BASELINE.map(({ path }) => `${path}: ${toolsNamedIn(read(path), ids).length}`);

    expect(actual, "an admitted file took on another tool — fix the count and its reason").toEqual(
      recorded
    );
  });

  it("derives the tools from the profiles, so a new one is subject to the rule at once", () => {
    const ids = toolIds(["src/contexts/tools/domain/profiles/frobnicator/profile.ts"]);

    expect(ids, "a directory under profiles/ is a tool").toEqual(["frobnicator"]);
    expect(
      toolsNamedIn('const target = "frobnicator";', ids),
      "and the rule matches it without anyone editing a list"
    ).toEqual(["frobnicator"]);
  });

  it("sees the four forms a quoted-literal match missed, and ignores prose", () => {
    const ids = ["claude", "codex"];

    expect(toolsNamedIn('codex: { "config.toml": x }', ids), "a bare object key").toEqual([
      "codex",
    ]);
    expect(
      toolsNamedIn('import "../../src/contexts/tools/domain/profiles/codex/build.js";', ids),
      "an import path"
    ).toEqual(["codex"]);
    expect(
      toolsNamedIn('"Conversion target (claude, codex)"', ids),
      "an enumeration inside one string"
    ).toEqual(["claude", "codex"]);
    expect(toolsNamedIn("// claude lays its files out differently", ids), "a comment").toEqual([]);
    expect(
      toolsNamedIn('throw new Error("claude is not installed")', ids),
      "one tool named"
    ).toEqual([]);
    expect(
      toolsNamedIn('join(root, ".cursor", "hooks.json")', ["cursor"]),
      "a dotfile directory literal"
    ).toEqual(["cursor"]);
  });

  it("flags a planted dotfile literal outside the baseline the way a real one would be", () => {
    const ids = ["cursor"];
    const file = "src/contexts/framework/application/some-new-helper.ts";
    const content = 'const hooksPath = join(projectRoot, ".cursor", "hooks.json");';

    expect(isAllowed(file, ids), "the planted file is not inside cursor's own profile").toBe(false);
    expect(
      toolsNamedIn(content, ids),
      "the same literal project-hooks-materializer.ts and plugin-remove-use-case.ts carried"
    ).toEqual(["cursor"]);
  });
});

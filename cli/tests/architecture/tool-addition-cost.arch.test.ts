/**
 * A tool identifier may only appear in that tool's own profile and in the shared vocabulary.
 * Everywhere else behaviour is read from the profile rather than branched on the name, or a
 * sixth tool means editing N files again. Scope is `src/`: a test naming the tool it tests is
 * not coupling. Comments are stripped first — prose about a tool's layout is documentation.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, read, sourceFiles } from "./helpers.js";

/** The tools, from the tree: a hand-written list leaves the rule blind to the next tool. */
function toolIds(files: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const file of files) {
    const match = /^src\/contexts\/tools\/domain\/profiles\/([^/]+)\//.exec(file);
    if (match) ids.add(match[1] as string);
  }
  return [...ids].sort();
}

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
 * Five forms force an edit: a quoted literal, an object key, a profile's import path, a
 * dotfile directory literal (`".cursor"`, which the exact-match form misses), and a string
 * enumerating two or more tools. A string naming one tool is not a list a sixth must join.
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
 * Files naming a tool outside its profile today, with how many they name; the list may only
 * shrink, and a listed file may not take on another tool. Three are not debt:
 * `tool-recommendations.ts`, `config-refs.ts` and `plugins-capability.ts`, each naming a tool
 * for a reason no profile carries. The rest is registration and words shown to a user.
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
  // A profile cannot name the adapter reading its transcripts without putting infrastructure
  // in the domain, so the tool-to-reader map lives at the composition root instead.
  { path: "src/runtime/wiring/telemetry.ts", named: 4 },
  // Which file each host keeps its plugin registry in, called from the composition root
  // alone; the reader classes beside it name no tool.
  {
    path: "src/contexts/tools/infrastructure/host-plugin-registry-reader-adapter.ts",
    named: 3,
  },
  // An adapter for exactly one tool, naming the binary it shells out to. A tool named in
  // its own adapter is not a list a new tool joins — a new tool brings its own adapter.
  { path: "src/contexts/telemetry/infrastructure/opencode-cost-reader-adapter.ts", named: 1 },
  // Cursor's project hooks file, named after the tool whose file it is: the directory it
  // writes into is Cursor's own, not a list a sixth tool joins.
  { path: "src/contexts/tools/domain/formats/cursor-hooks-project-merge.ts", named: 1 },
  // Flat-mode plugin extraction, keyed to the one path prefix flat materialization writes
  // (`.opencode/`). A second flat-mode tool would need its own prefix check; there is one.
  {
    path: "src/contexts/framework/application/framework/translator/built-tree-materialization-translator.ts",
    named: 1,
  },
  // An adapter for exactly one tool, naming its own session-state directory.
  { path: "src/contexts/telemetry/infrastructure/copilot-cost-reader-adapter.ts", named: 1 },
  // An adapter for exactly one tool, naming its own hook-trust config path.
  { path: "src/contexts/telemetry/infrastructure/hook-trust-reader-adapter.ts", named: 1 },
  // Real coupling, not excused: one shared file reaches into two tools' own directories to
  // detect whether either was ever used, and a third tool would extend it.
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
});

describe("the guard itself", () => {
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

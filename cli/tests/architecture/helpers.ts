/**
 * Shared source-graph helpers for architecture tests.
 *
 * These tests read source as text. They never import the code under test, so they
 * stay fast enough for a pre-commit hook and cannot be broken by runtime wiring.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

export const CLI_ROOT = resolve(import.meta.dirname, "..", "..");
export const SRC = join(CLI_ROOT, "src");

/** One level above the cli package: where a plugin's own README and the repository's
 * workflows live, outside anything `sourceFiles()` or `read()` alone can see. */
export const REPO_ROOT = resolve(CLI_ROOT, "..");

/** Every `.ts` file under `src/`, as paths relative to the cli package root. */
export function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) out.push(relative(CLI_ROOT, full));
    }
  };
  walk(SRC);
  return out.sort();
}

export function read(relativePath: string): string {
  return readFileSync(join(CLI_ROOT, relativePath), "utf8");
}

/** Reads a file relative to the repository root, one level above the cli package - for the
 * few things this suite must see outside `cli/`, a plugin's own README most concretely. */
export function readFromRepoRoot(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

/** Every plugin's own README, repo-root-relative. Errors loudly on an empty result so a
 * moved or renamed `plugins/` directory fails here rather than quietly scanning nothing. */
export function pluginReadmes(): string[] {
  const pluginsDir = join(REPO_ROOT, "plugins");
  const found: string[] = [];
  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const readme = join(pluginsDir, entry.name, "README.md");
    if (existsSync(readme)) found.push(join("plugins", entry.name, "README.md"));
  }
  if (found.length === 0) {
    throw new Error("no plugin README found — the scope of this rule is stale");
  }
  return found.sort();
}

/**
 * Every way one file names another in this codebase.
 *
 * `from "./x.js"`, a bare side-effect `import "./x.js"` — that is how tool profiles register
 * themselves — and `import("./x.js")`, which appears as a type expression. The last form was
 * missing while `context-graph.arch.test.ts` had it, so two extractors in this directory
 * disagreed and one real dependency was invisible to every rule built on this one. A third
 * extractor (`RELATIVE_IMPORT`, requiring a literal `.js` suffix) lived there too, for the
 * same reason and with the same fix: one pattern, used everywhere a source file's imports
 * are read.
 *
 * The `@/` alias `tsconfig.json` defines resolves to `src/`. Nothing in `src/` uses it today;
 * it is handled so that using it does not silently take a file out of every rule's sight.
 */
export const INTERNAL_IMPORT = /(?:from|import)\s*\(?\s*["'](\.[^"']+|@\/[^"']+)["']/g;

/** Where a specifier one file names another points, relative to the cli package root. */
function resolveImportTarget(file: string, specifier: string): string {
  return (
    specifier.startsWith("@/")
      ? `src/${specifier.slice(2)}`
      : normalize(join(dirname(file), specifier))
  ).replace(/\.js$/, ".ts");
}

/**
 * Maps every source file to the set of files importing it.
 * Side-effect imports (`import "./x.js"`) count: that is how tools register themselves.
 */
export function importersByFile(): Map<string, Set<string>> {
  const files = sourceFiles();
  const known = new Set(files);
  const importers = new Map<string, Set<string>>();
  for (const file of files) {
    const text = read(file);
    for (const match of text.matchAll(INTERNAL_IMPORT)) {
      const target = resolveImportTarget(file, match[1] as string);
      if (!known.has(target)) continue;
      const set = importers.get(target) ?? new Set<string>();
      set.add(file);
      importers.set(target, set);
    }
  }
  return importers;
}

/**
 * Compares current violations against a frozen baseline.
 *
 * The baseline may only shrink. A new violation fails immediately; removing one
 * without updating the baseline also fails, so the list stays honest.
 */
export function expectRatchet(
  current: readonly string[],
  baseline: readonly string[]
): { added: string[]; fixed: string[] } {
  const base = new Set(baseline);
  const now = new Set(current);
  return {
    added: current.filter((entry) => !base.has(entry)).sort(),
    fixed: baseline.filter((entry) => !now.has(entry)).sort(),
  };
}

/**
 * Matches the subset of glob syntax this suite's own declarations use: a literal prefix,
 * `/**\/` for any number of directories including none, `*` within one segment. Written out
 * rather than pulled in, so the rule it enforces is visible beside the test.
 *
 * The "including none" is the whole subtlety: `src/kernel/**\/*.ts` has to match
 * `src/kernel/errors.ts` as well as `src/kernel/ports/logger.ts`, or a scope silently
 * covers only its subdirectories.
 */
export function matchesGlob(glob: string, path: string): boolean {
  const pattern = glob
    .split("/**/")
    .map((segment) => segment.split("*").map(escapeGlobLiteral).join("[^/]*"))
    .join("/(?:.*/)?");
  return new RegExp(`^${pattern}$`).test(path);
}

function escapeGlobLiteral(literal: string): string {
  return literal.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------------------
// The context graph: single source of truth for which context may import which.
//
// Moved here from context-graph.arch.test.ts so a second rule — cli/biome.json's per-context
// `noRestrictedImports` overrides, checked in biome-context-parity.arch.test.ts — can compare
// against this same ALLOWED/BASELINE data instead of a hand-copied list that only looks like
// it agrees.
// ---------------------------------------------------------------------------------------

/** Every context this codebase currently declares, read from the tree rather than typed out
 * a second time — a context added or removed shows up here without an edit. */
export function contextNames(): string[] {
  return readdirSync(join(SRC, "contexts"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * `arborescence.md` invariant 2 allows exactly these edges between contexts:
 * `framework → translate`, `translate → tools`, `framework → distribution`, and every
 * context to the kernel. `framework → tools` is allowed too: framework installs for a
 * tool and must name it.
 */
export const ALLOWED = new Set([
  "framework->translate",
  "framework->tools",
  "framework->distribution",
  "translate->tools",
  // Measurement asks a tool what it declares — its registry entry, where its transcripts
  // live, the shape of its hooks file — and a tool declares nothing about measurement in
  // return. The vocabulary both speak (`kernel/measurement.ts`) sits in the kernel, which
  // is what makes the reverse edge structurally impossible rather than merely absent.
  "telemetry->tools",
]);

/**
 * Edges the chain forbids and the tree still has. The list may only shrink, and each entry
 * carries what it admits, measured — an edge alone says nothing about its weight, so a
 * baselined edge could absorb any number of new imports in silence. `folder-size` already
 * counts its entries; this carries the same shape here.
 */
export const BASELINE: readonly {
  readonly edge: string;
  readonly imports: number;
  readonly files: number;
}[] = [
  // `marketplace add --overwrite` removes before it adds, and removing deletes the
  // installed plugin files — framework work. The orchestration belongs to whoever calls
  // both, not to the context that only knows where content comes from.
  { edge: "distribution->framework", imports: 1, files: 1 },
  // Three implementations and one port: the http client, the git token injection and the
  // user-config directory are concrete, so this edge is a real dependency on runtime and
  // not a misplaced contract. It resolves by inverting them into ports this context holds.
  { edge: "distribution->runtime", imports: 5, files: 3 },
  // Three framework orchestrators still name the prompt classes they are handed. Type-only
  // imports with unchanged signatures — inverting them into a port is a design change, not
  // the move phase 16 was. Recorded so it is measured rather than remembered.
  { edge: "framework->presentation", imports: 4, files: 3 },
  // Three targets, every one an interface: token provider, platform, latest release
  // resolver. Those are contracts a context is entitled to depend on, sitting in the wrong
  // place — a port used by two contexts belongs in the kernel, as phase 9 established.
  // Nothing concrete crosses here. `version-reader` was the fourth and has since moved to
  // `kernel/ports/`, which is what this count dropping from thirteen records.
  { edge: "framework->runtime", imports: 8, files: 7 },
];

export function contextOf(file: string): string {
  const inContext = /^src\/contexts\/([^/]+)\//.exec(file);
  if (inContext) return inContext[1] as string;
  if (file.startsWith("src/kernel/")) return "kernel";
  if (file.startsWith("src/presentation/")) return "presentation";
  if (file.startsWith("src/runtime/")) return "runtime";
  return "outside";
}

/** A layer a context may not depend on: the arrows run towards the kernel, never back. */
export const BELOW_NOTHING = new Set(["presentation", "runtime"]);

export function isContext(name: string): boolean {
  return !BELOW_NOTHING.has(name) && name !== "kernel" && name !== "outside";
}

interface Crossing {
  readonly file: string;
  readonly from: string;
  readonly to: string;
  /** `domain`, `application` or `infrastructure` — null when `file` is not itself under a
   * context's own layer split (kernel, presentation, runtime). */
  readonly layer: "domain" | "application" | "infrastructure" | null;
}

const LAYER_OF_FILE = /^src\/contexts\/[^/]+\/(domain|application|infrastructure)\//;

/** Every import that crosses from one context (or kernel) into another, once — the one
 * walk every edge-shaped rule in this directory builds on. */
function crossings(files: readonly string[]): Crossing[] {
  const out: Crossing[] = [];
  for (const file of files) {
    const from = contextOf(file);
    const source = read(file);
    const layerMatch = LAYER_OF_FILE.exec(file);
    for (const match of source.matchAll(INTERNAL_IMPORT)) {
      const target = resolveImportTarget(file, match[1] as string);
      const to = contextOf(target);
      if (from === to || to === "kernel" || from === "outside" || to === "outside") continue;
      // presentation and runtime may reach down; only the reverse is an edge worth naming.
      if (BELOW_NOTHING.has(from)) continue;
      out.push({ file, from, to, layer: (layerMatch?.[1] as Crossing["layer"]) ?? null });
    }
  }
  return out;
}

/** Every context-to-context edge the import graph contains, with how much crosses each. */
export function weighedEdges(
  files: readonly string[]
): Map<string, { imports: number; files: number }> {
  const found = new Map<string, { imports: number; files: Set<string> }>();
  for (const crossing of crossings(files)) {
    const edge = `${crossing.from}->${crossing.to}`;
    const weight = found.get(edge) ?? { imports: 0, files: new Set<string>() };
    weight.imports += 1;
    weight.files.add(crossing.file);
    found.set(edge, weight);
  }
  return new Map(
    [...found].map(([edge, weight]) => [
      edge,
      { imports: weight.imports, files: weight.files.size },
    ])
  );
}

/** Every context-to-context edge the import graph actually contains. */
export function edgesBetweenContexts(files: readonly string[]): string[] {
  return [...weighedEdges(files).keys()].sort();
}

/** For each edge `BASELINE` records, the set of layers (of the edge's own `from` context)
 * whose files actually carry it — "distribution->framework" only from `application/`,
 * "framework->runtime" only from `application/`, and so on. Derived from the same walk
 * `weighedEdges` does rather than typed out a second time, so a debt file moving layer, or
 * a new one landing under an existing edge, shows up here without anyone updating a list. */
export function baselineLayers(files: readonly string[]): Map<string, Set<string>> {
  const baselineEdges = new Set(BASELINE.map((entry) => entry.edge));
  const layers = new Map<string, Set<string>>();
  for (const crossing of crossings(files)) {
    const edge = `${crossing.from}->${crossing.to}`;
    if (!baselineEdges.has(edge) || crossing.layer === null) continue;
    const set = layers.get(edge) ?? new Set<string>();
    set.add(crossing.layer);
    layers.set(edge, set);
  }
  return layers;
}

// ---------------------------------------------------------------------------------------
// Command declarations: shared by every rule that checks a command mention is real.
// ---------------------------------------------------------------------------------------

/**
 * Every invocation the CLI declares: a top-level verb, and each `noun verb` pair.
 *
 * The pair matters. A message or a document naming `aidd plugin marketplace add` passes
 * any check that only looks at the first word, because `plugin` exists — while
 * `marketplace` is not one of its subcommands, which is precisely how one error message
 * shipped wrong, and how a doc citing `aidd plugin bogus` read as citing the existing
 * `plugin` group and nothing else.
 */
export function declaredCommands(): Set<string> {
  const declared = new Set<string>();
  for (const file of sourceFiles().filter((f) => f.startsWith("src/presentation/commands/"))) {
    const source = read(file);
    // `const x = program.command("noun")` names a parent; every other `.command("verb")`
    // in that file is one of its subcommands.
    const parent = /program\s*\n?\s*\.?command\("([a-z][a-z-]*)"/.exec(source)?.[1];
    for (const match of source.matchAll(/\.command\("([a-z][a-z-]*)/g)) {
      declared.add(match[1] as string);
      if (parent !== undefined && match[1] !== parent) declared.add(`${parent} ${match[1]}`);
    }
  }
  // An empty set would clear every document at once: nothing can be undeclared when
  // nothing is declared. A sibling rule failed exactly that way when its directory
  // moved, so the emptiness is checked rather than assumed.
  if (declared.size === 0) throw new Error("no command found — the scope of this rule is stale");
  return declared;
}

/** A word that reads as an argument rather than a subcommand: a placeholder, or a word a
 * path continues right past — `aidd sync rules/naming.md` names a file, not a subcommand
 * called `rules`, and the `/` immediately after it is the tell no placeholder syntax gives. */
function isArgumentLike(word: string, trailing: string): boolean {
  return word.startsWith("<") || word.startsWith("[") || trailing.startsWith("/");
}

const INSTRUCTED_COMMAND = /\baidd ([a-z][a-z-]*)(?: ([a-z][a-z-]*)([^\s`]*))?/g;

/**
 * `aidd <verb>` or `aidd <noun> <verb>` as it appears inside text, resolved against a
 * pair-aware declared set. Shared by every rule that checks a command mention is real: an
 * error message that instructs the reader, or a document that claims a command works today.
 */
export function unresolvedCommandMentions(text: string, declared: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  for (const match of text.matchAll(INSTRUCTED_COMMAND)) {
    const [, first, second, trailing] = match;
    // A bare verb needs only itself declared; `aidd setup --ai` reads as a bare verb
    // because a flag is not a word this pattern captures. A pair needs the pair.
    if (second === undefined) {
      if (!declared.has(first as string)) missing.push(first as string);
      continue;
    }
    if (declared.has(`${first} ${second}`)) continue;
    // A declared verb followed by something else is that verb plus an argument, not a
    // subcommand: `aidd marketplace add` is a pair, `aidd update --force` is not.
    if (declared.has(first as string) && isArgumentLike(second, trailing ?? "")) continue;
    missing.push(`${first} ${second}`);
  }
  return missing;
}

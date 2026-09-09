/**
 * These tests read source as text and never import the code under test, so they stay fast
 * enough for a pre-commit hook and cannot be broken by runtime wiring.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

export const CLI_ROOT = resolve(import.meta.dirname, "..", "..");
export const SRC = join(CLI_ROOT, "src");

export const REPO_ROOT = resolve(CLI_ROOT, "..");

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

export function readFromRepoRoot(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

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
 * Every way one file names another: `from "./x.js"`, a bare side-effect `import "./x.js"`,
 * and the `import("./x.js")` type expression. A second extractor anywhere in this directory
 * would disagree with this one and hide a real dependency. The `@/` alias resolves to `src/`
 * and is handled although nothing uses it today, so using it takes no file out of sight.
 */
export const INTERNAL_IMPORT = /(?:from|import)\s*\(?\s*["'](\.[^"']+|@\/[^"']+)["']/g;

function resolveImportTarget(file: string, specifier: string): string {
  return (
    specifier.startsWith("@/")
      ? `src/${specifier.slice(2)}`
      : normalize(join(dirname(file), specifier))
  ).replace(/\.js$/, ".ts");
}

/** Side-effect imports (`import "./x.js"`) count: that is how tools register themselves. */
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

/** The baseline may only shrink: a new violation fails, and so does removing one without
 * taking it out of the baseline. */
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
 * The subset of glob syntax this suite declares: a literal prefix, `/**\/` for any number of
 * directories *including none* — `src/kernel/**\/*.ts` must match `src/kernel/errors.ts` too,
 * or a scope silently covers only its subdirectories — and `*` within one segment.
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

// The context graph: single source of truth for which context may import which. It lives here
// so `biome-context-parity.arch.test.ts` compares biome's own per-context `noRestrictedImports`
// overrides against this same data rather than a hand-copied list that only looks like it agrees.

export function contextNames(): string[] {
  return readdirSync(join(SRC, "contexts"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Exactly these edges between contexts, plus every context to the kernel. `framework → tools`
 * is among them because framework installs for a tool and must name it. */
export const ALLOWED = new Set([
  "framework->translate",
  "framework->tools",
  "framework->distribution",
  "translate->tools",
  // Measurement asks a tool what it declares; a tool declares nothing about measurement in
  // return, since the vocabulary both speak sits in `kernel/measurement.ts`.
  "telemetry->tools",
]);

/**
 * Edges the chain forbids and the tree still has. The list may only shrink, and each entry
 * carries its measured weight: an edge alone could absorb any number of imports in silence.
 */
export const BASELINE: readonly {
  readonly edge: string;
  readonly imports: number;
  readonly files: number;
}[] = [
  // `marketplace add --overwrite` removes before it adds, and removing deletes installed
  // plugin files — framework work the calling side, not distribution, should orchestrate.
  { edge: "distribution->framework", imports: 1, files: 1 },
  // The http client, the git token injection, the user-config directory and `atomicWriteFile`
  // are concrete: a real dependency on runtime, resolved by inverting them into ports.
  { edge: "distribution->runtime", imports: 6, files: 3 },
  // Three framework orchestrators still name the prompt classes they are handed, type-only.
  // Inverting them into a port is a design change, so the edge is measured rather than moved.
  { edge: "framework->presentation", imports: 4, files: 3 },
  // Token provider, platform and latest-release resolver: interfaces a context may depend on,
  // sitting in the wrong place — a port two contexts need belongs in the kernel. Nothing
  // concrete crosses here.
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

/** The one walk every edge-shaped rule in this directory builds on. */
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

export function edgesBetweenContexts(files: readonly string[]): string[] {
  return [...weighedEdges(files).keys()].sort();
}

/** For each baselined edge, the layers of its `from` context that carry it — derived from the
 * same walk, so a debt file moving layer shows up without anyone updating a list. */
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

/**
 * Every invocation the CLI declares: a top-level verb, and each `noun verb` pair. The pair
 * matters — `aidd plugin marketplace add` passes any check reading only the first word.
 */
export function declaredCommands(): Set<string> {
  const declared = new Set<string>();
  for (const file of sourceFiles().filter((f) => f.startsWith("src/presentation/commands/"))) {
    const source = read(file);
    // `program.command("noun")` names a parent; every other `.command("verb")` in that file
    // is one of its subcommands.
    const parent = /program\s*\n?\s*\.?command\("([a-z][a-z-]*)"/.exec(source)?.[1];
    for (const match of source.matchAll(/\.command\("([a-z][a-z-]*)/g)) {
      declared.add(match[1] as string);
      if (parent !== undefined && match[1] !== parent) declared.add(`${parent} ${match[1]}`);
    }
  }
  // An empty set would clear every document at once: nothing can be undeclared when nothing
  // is declared.
  if (declared.size === 0) throw new Error("no command found — the scope of this rule is stale");
  return declared;
}

/** A placeholder, or a word a path continues right past: `aidd sync rules/naming.md` names a
 * file, and the `/` right after it is the tell no placeholder syntax gives. */
function isArgumentLike(word: string, trailing: string): boolean {
  return word.startsWith("<") || word.startsWith("[") || trailing.startsWith("/");
}

const INSTRUCTED_COMMAND = /\baidd ([a-z][a-z-]*)(?: ([a-z][a-z-]*)([^\s`]*))?/g;

/** `aidd <verb>` or `aidd <noun> <verb>` as it appears inside text, resolved against a
 * pair-aware declared set. */
export function unresolvedCommandMentions(text: string, declared: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  for (const match of text.matchAll(INSTRUCTED_COMMAND)) {
    const [, first, second, trailing] = match;
    // A bare verb needs only itself declared — `aidd setup --ai` reads as one, a flag being
    // no word this pattern captures. A pair needs the pair.
    if (second === undefined) {
      if (!declared.has(first as string)) missing.push(first as string);
      continue;
    }
    if (declared.has(`${first} ${second}`)) continue;
    // A declared verb followed by something else is that verb plus an argument:
    // `aidd marketplace add` is a pair, `aidd update --force` is not.
    if (declared.has(first as string) && isArgumentLike(second, trailing ?? "")) continue;
    missing.push(`${first} ${second}`);
  }
  return missing;
}

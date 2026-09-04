/**
 * A use case that orchestrates several areas depends on their entry points, one per
 * area. A constructor listing many collaborators is the signal that the orchestration
 * reaches inside areas instead of asking them.
 *
 * See `.claude/rules/00-architecture/0-orchestration.md`.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, read, sourceFiles } from "./helpers.js";

/** Above this, an orchestrator is reaching inside the areas it crosses. */
const MAX_INJECTED_USE_CASES = 4;

/**
 * Orchestrators over the limit today, each with the count its reason was written around.
 * The list may only shrink, and a listed file may not absorb another collaborator: an entry
 * naming only the file would let one grow from five to fifteen in silence.
 *
 * Both entries had no reason written at all — just "exceed the limit today" — in a file whose
 * siblings carry paragraphs. Measured and stated now.
 */
const BASELINE: readonly { readonly path: string; readonly injected: number }[] = [
  // Six checks, one per thing that can drift: tracked files, merged files, plugins,
  // references, layout, registration. `doctor` reports on every one of them at once, so the
  // fan-out is the feature. It resolves by giving each check a result type and asking a
  // single `DriftReport` to collect them, not by removing a check.
  { path: "src/contexts/framework/application/doctor/doctor-use-case.ts", injected: 6 },
  // Six steps of one flow: resolve the marketplace source, register the framework, refresh,
  // sync settings, install tools, prompt for plugins. `setup` is the command that brings a
  // project from nothing to correct, so it necessarily names each stage. It resolves by
  // splitting the flow in two — marketplace groundwork, then tools and plugins.
  { path: "src/contexts/framework/application/setup-use-case.ts", injected: 6 },
];

/**
 * Every type this module imports from a `*-use-case.ts` module.
 *
 * Counting by the `UseCase` suffix alone was blind, and measurably so: naming a
 * collaborator by the narrow interface its own module exports — `PluginAdd` rather than
 * `PluginAddUseCase` — took three collaborators off `setup-use-case.ts`'s count without
 * removing one. What makes something a use case is where it is declared, not how it reads.
 */
function useCaseTypesImportedBy(source: string): ReadonlySet<string> {
  const named = new Set<string>();
  for (const line of source.matchAll(/import type \{([^}]*)\} from "([^"]*)";/g)) {
    if (!line[2].endsWith("-use-case.js")) continue;
    for (const name of line[1].split(",")) {
      const cleaned = name.replace(/\btype\b/, "").trim();
      if (cleaned) named.add(cleaned);
    }
  }
  return named;
}

function injectedUseCaseCount(source: string): number {
  const signature = /constructor\((.*?)\)\s*\{/s.exec(source);
  if (!signature) return 0;
  const fromUseCaseModules = useCaseTypesImportedBy(source);
  const params = [...signature[1].matchAll(/private readonly \w+:\s*([\w<>[\]| ]+)/g)];
  return params.filter(
    (param) => param[1].includes("UseCase") || fromUseCaseModules.has(param[1].trim())
  ).length;
}

/** Where a use case lives: inside a context's application layer. */
function isUseCase(file: string): boolean {
  return /^src\/contexts\/[^/]+\/application\//.test(file);
}

/** The rule itself: does this constructor source cross the limit? */
function overLimit(source: string): boolean {
  return injectedUseCaseCount(source) > MAX_INJECTED_USE_CASES;
}

describe("orchestrators depend on entry points, not on parts", () => {
  it(`no use case injects more than ${MAX_INJECTED_USE_CASES} other use cases`, () => {
    const candidates = sourceFiles().filter(isUseCase);
    // A rule that selects nothing passes forever. This one did: its filter named the
    // flat `use-cases/` tree, and when those files moved into contexts it silently
    // stopped applying to every one of them while reporting the baseline as fixed.
    expect(candidates.length, "the rule selects no file — its scope is stale").toBeGreaterThan(20);
    const violations = candidates.filter((file) => overLimit(read(file)));

    const { added, fixed } = expectRatchet(
      violations,
      BASELINE.map((entry) => entry.path)
    );
    expect(added, "orchestrator reaching inside the areas it crosses").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("holds each admitted orchestrator to the count its reason was written around", () => {
    const recorded = BASELINE.map(({ path, injected }) => `${path}: ${injected}`);
    const actual = BASELINE.map(({ path }) => `${path}: ${injectedUseCaseCount(read(path))}`);

    expect(
      actual,
      "an admitted orchestrator took on another collaborator — fix the count and its reason"
    ).toEqual(recorded);
  });

  it("flags a constructor past the limit and clears one sitting at the limit", () => {
    const over = `constructor(
      ${Array.from({ length: MAX_INJECTED_USE_CASES + 1 }, (_, i) => `private readonly a${i}: FooUseCase,`).join("\n")}
    ) {}`;
    const atLimit = `constructor(
      ${Array.from({ length: MAX_INJECTED_USE_CASES }, (_, i) => `private readonly a${i}: FooUseCase,`).join("\n")}
    ) {}`;

    expect(overLimit(over)).toBe(true);
    expect(overLimit(atLimit)).toBe(false);
  });
});

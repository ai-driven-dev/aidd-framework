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
  // Nine collaborators, six required plus three optional the old regex never counted
  // (`private readonly x?:` has a `?` between the name and the colon it didn't match):
  // resolve the marketplace source, register the framework, refresh, sync settings,
  // install tools, prompt for plugins, plus optional prompts for tools and context
  // detection and an optional release resolver. `setup` is the command that brings a
  // project from nothing to correct, so it necessarily names each stage. It resolves by
  // splitting the flow in two — marketplace groundwork, then tools and plugins.
  //
  // Also injected today, and deliberately absent from this count: `fs`, `manifestRepo`,
  // `currentVersionProvider`, `logger`, `tokenProvider` and `userSourceReferences` — a
  // plain port, not another use case this one orchestrates. `injectedUseCaseCount` only
  // ever counts a type imported from a module suffixed `*-use-case.js`, or a name
  // containing `UseCase`, on purpose: a port is a dependency this use case reads or
  // writes through, never a step it delegates to
  // and waits on, which is the depth this ratchet measures. `UserSourceReferences` used
  // to sit under `application/machine-scope/`, a name close enough to a use case that
  // its absence from this count read as a gap; moved to `domain/ports/`, alongside every
  // other port this file already carries uncounted, it is exactly what it always was.
  { path: "src/contexts/framework/application/setup-use-case.ts", injected: 9 },
  // Five section generators reached via `new XUseCase(...)` inside a switch on content
  // section name (agents, commands, rules, skills) plus the config generator called from
  // both the IDE and AI branches — invisible to the old regex, which only ever looked at
  // constructor parameters. It resolves by giving each section type its own registered
  // generator instead of a switch, not by removing a section.
  {
    path: "src/contexts/framework/application/restore/generate-tool-distribution-use-case.ts",
    injected: 5,
  },
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

/**
 * Constructor-injected collaborators plus the ones a method reaches for on its own via
 * `new XUseCase(...)`. The two are counted separately then summed, deduped by class name
 * within each: a use case instantiated twice in two methods is still one collaborator,
 * the same way a constructor parameter is.
 */
function injectedUseCaseCount(source: string): number {
  const signature = /constructor\((.*?)\)\s*\{/s.exec(source);
  const fromUseCaseModules = useCaseTypesImportedBy(source);
  const paramCount = signature
    ? [...signature[1].matchAll(/private readonly \w+\??:\s*([\w<>[\]| ]+)/g)].filter(
        (param) => param[1].includes("UseCase") || fromUseCaseModules.has(param[1].trim())
      ).length
    : 0;
  const inlineNames = new Set([...source.matchAll(/new (\w+UseCase)\(/g)].map((m) => m[1]));
  return paramCount + inlineNames.size;
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

  it("counts an optional constructor dependency, not just a required one", () => {
    // `private readonly foo?: FooUseCase` has a `?` between the name and the colon that
    // `\w+:` never matched, so a use case could sit at the limit on paper while carrying
    // one more optional collaborator undetected.
    const atLimit = `constructor(
      ${Array.from({ length: MAX_INJECTED_USE_CASES }, (_, i) => `private readonly a${i}: FooUseCase,`).join("\n")}
    ) {}`;
    const withOptionalOverLimit = `constructor(
      ${Array.from({ length: MAX_INJECTED_USE_CASES }, (_, i) => `private readonly a${i}: FooUseCase,`).join("\n")}
      private readonly extra?: FooUseCase
    ) {}`;

    expect(overLimit(atLimit)).toBe(false);
    expect(overLimit(withOptionalOverLimit)).toBe(true);
  });

  it("counts a use case instantiated inline in a method body, not just an injected one", () => {
    const atLimit = `constructor(
      ${Array.from({ length: MAX_INJECTED_USE_CASES }, (_, i) => `private readonly a${i}: FooUseCase,`).join("\n")}
    ) {}
    method(): void { new BarUseCase(this.a0).execute(); }`;

    expect(overLimit(atLimit)).toBe(true);
  });
});

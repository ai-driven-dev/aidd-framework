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
 * This baseline was rebuilt whole once `injectedUseCaseCount` started counting every
 * constructor parameter instead of only the ones spelled or imported like a use case
 * (see that function's own doc). That widened lens surfaced 28 more files at once — not
 * new debt, debt this ratchet had never been able to see — so most entries below carry
 * only their measured count rather than a paragraph each; the three carried over from
 * before keep the reasoning already written for them.
 */
const BASELINE: readonly { readonly path: string; readonly injected: number }[] = [
  // Six checks, one per thing that can drift: tracked files, merged files, plugins,
  // references, layout, registration. `doctor` reports on every one of them at once, so the
  // fan-out is the feature. It resolves by giving each check a result type and asking a
  // single `DriftReport` to collect them, not by removing a check.
  { path: "src/contexts/framework/application/doctor/doctor-use-case.ts", injected: 7 },
  // Eleven collaborators: the shared source-registration step
  // (`SetupMarketplaceRegistrationUseCase`, itself extracted so this file would not
  // carry resolve/guard/register/refresh's own collaborators directly), install tools,
  // prompt for plugins, sync settings, current version, plus optional prompts for
  // tools and context detection and the machine-scope handoff
  // (`SetupMachineScopeUseCase`). `setup` is the command that brings a project from
  // nothing to correct, so it necessarily names each stage.
  { path: "src/contexts/framework/application/setup-use-case.ts", injected: 11 },
  // Five section generators reached via `new XUseCase(...)` inside a switch on content
  // section name (agents, commands, rules, skills) plus the config generator called from
  // both the IDE and AI branches, now on top of its own four constructor collaborators
  // the old regex never looked at. It resolves by giving each section type its own
  // registered generator instead of a switch, not by removing a section.
  {
    path: "src/contexts/framework/application/restore/generate-tool-distribution-use-case.ts",
    injected: 9,
  },
  {
    path: "src/contexts/framework/application/flows/marketplace-sync-settings-use-case.ts",
    injected: 12,
  },
  { path: "src/contexts/framework/application/restore/restore-use-case.ts", injected: 12 },
  // 11, one more than before: `hostPluginRegistries`, the host's own plugin registry
  // reader per `AiToolId`, consulted before uninstalling a ref so the scope asked for
  // is the one the host actually registered it at (see `resolveUninstallScopeOrder`).
  { path: "src/contexts/framework/application/clean-use-case.ts", injected: 11 },
  // The machine-scope counterpart of `clean-use-case.ts`, same shape and same reason:
  // fs, the user manifest repository, logger, the marketplace registry, the user
  // config dir resolver, activators, host marketplace registries, homedir, the shared
  // source references port and the prompter.
  {
    path: "src/contexts/framework/application/clean/clean-user-scope-use-case.ts",
    injected: 10,
  },
  { path: "src/contexts/telemetry/application/diagnose-telemetry-use-case.ts", injected: 10 },
  {
    path: "src/contexts/framework/application/restore/restore-tool-files-use-case.ts",
    injected: 9,
  },
  {
    path: "src/contexts/framework/application/shared/setup-marketplace-registration-use-case.ts",
    injected: 9,
  },
  { path: "src/contexts/framework/application/plugin/plugin-add-use-case.ts", injected: 8 },
  { path: "src/contexts/translate/application/strategies/flat-build-strategy.ts", injected: 8 },
  {
    path: "src/contexts/framework/application/doctor/doctor-registration-use-case.ts",
    injected: 7,
  },
  { path: "src/contexts/telemetry/application/read-local-cost-use-case.ts", injected: 7 },
  { path: "src/contexts/telemetry/application/report-cost-use-case.ts", injected: 7 },
  { path: "src/contexts/framework/application/install/install-ide-tool-use-case.ts", injected: 6 },
  { path: "src/contexts/framework/application/plugin/plugin-install-use-case.ts", injected: 6 },
  { path: "src/contexts/framework/application/plugin/plugin-update-use-case.ts", injected: 6 },
  {
    path: "src/contexts/framework/application/restore/restore-all-plugins-use-case.ts",
    injected: 6,
  },
  { path: "src/contexts/distribution/application/marketplace-add-use-case.ts", injected: 5 },
  { path: "src/contexts/distribution/application/marketplace-refresh-use-case.ts", injected: 5 },
  {
    path: "src/contexts/framework/application/framework/translator/built-tree-materialization-translator.ts",
    injected: 5,
  },
  { path: "src/contexts/framework/application/global/update-one-tool-use-case.ts", injected: 5 },
  { path: "src/contexts/framework/application/install/install-ai-tool-use-case.ts", injected: 5 },
  {
    path: "src/contexts/framework/application/install/install-ide-config-use-case.ts",
    injected: 5,
  },
  {
    path: "src/contexts/framework/application/install/install-runtime-config-use-case.ts",
    injected: 5,
  },
  {
    path: "src/contexts/framework/application/plugin/plugin-install-from-marketplace-use-case.ts",
    injected: 5,
  },
  { path: "src/contexts/framework/application/shared/apply-plugin-files-use-case.ts", injected: 5 },
  {
    path: "src/contexts/framework/application/shared/ensure-built-marketplace-use-case.ts",
    injected: 5,
  },
  { path: "src/contexts/telemetry/application/telemetry-on-use-case.ts", injected: 5 },
  {
    path: "src/contexts/translate/application/strategies/marketplace-build-strategy.ts",
    injected: 5,
  },
  { path: "src/contexts/translate/application/translate-source.ts", injected: 5 },
  // 7: fs, manifestRepo, logger, activators, `hostPluginRegistries` (same reason
  // `clean-use-case.ts` carries it), plus `userSourceReferences` and
  // `marketplaceRegistry` — the shared-source guard `clean` already applies before
  // uninstalling a ref, applied here too so `plugin remove` in one project cannot
  // disable a plugin another project on the same machine still needs.
  { path: "src/contexts/framework/application/plugin/plugin-remove-use-case.ts", injected: 7 },
];

/**
 * Constructor-injected collaborators — every one, not only a type named or imported as
 * a use case — plus the ones a method reaches for on its own via `new XUseCase(...)`.
 *
 * Counting by the `UseCase` suffix, or by a type imported from a `*-use-case.ts`
 * module, was blind twice over: naming a collaborator by the narrow interface its own
 * module exports — `PluginAdd` rather than `PluginAddUseCase` — took three
 * collaborators off `setup-use-case.ts`'s count without removing one, and a plain port
 * (`userManifestRepo?: ManifestRepository`, neither named nor imported as a use case)
 * took on a 16th collaborator there while this ratchet's own count stayed frozen at 9.
 * `0-orchestration.md`'s own rule is about what a constructor lists, not about how each
 * listed type happens to be spelled — so every constructor parameter counts, required
 * or optional, whatever its type. The two are counted separately then summed, deduped
 * by class name within each: a use case instantiated twice in two methods is still one
 * collaborator, the same way a constructor parameter is.
 */
function injectedUseCaseCount(source: string): number {
  const signature = /constructor\((.*?)\)\s*\{/s.exec(source);
  const paramCount = signature
    ? [...signature[1].matchAll(/private readonly \w+\??:\s*[\w<>[\]| ]+/g)].length
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

  it("counts a plain port too, not only a collaborator named or imported as a use case", () => {
    // `userManifestRepo?: ManifestRepository` slipped past this ratchet unnoticed
    // (`ManifestRepository` neither contains `UseCase` nor comes from a `*-use-case.js`
    // module) — a real orchestrator took on a 16th collaborator while this test's own
    // count stayed frozen at 9. Any injected collaborator is a dependency the
    // constructor lists, whatever its own type is named or where it is declared.
    const atLimit = `constructor(
      ${Array.from({ length: MAX_INJECTED_USE_CASES }, (_, i) => `private readonly a${i}: FooUseCase,`).join("\n")}
    ) {}`;
    const withPlainPortOverLimit = `constructor(
      ${Array.from({ length: MAX_INJECTED_USE_CASES }, (_, i) => `private readonly a${i}: FooUseCase,`).join("\n")}
      private readonly extra?: ManifestRepository
    ) {}`;

    expect(overLimit(atLimit)).toBe(false);
    expect(overLimit(withPlainPortOverLimit)).toBe(true);
  });
});

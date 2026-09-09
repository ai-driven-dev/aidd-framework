/**
 * A constructor listing many collaborators is the signal that an orchestration reaches
 * inside the areas it crosses instead of asking their entry points.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, read, sourceFiles } from "./helpers.js";

/** Above this, an orchestrator is reaching inside the areas it crosses. */
const MAX_INJECTED_USE_CASES = 4;

/**
 * Orchestrators over the limit today, each with the count its reason was written around.
 * The list may only shrink, and an entry naming only the file would let one grow in silence.
 */
const BASELINE: readonly { readonly path: string; readonly injected: number }[] = [
  // Six checks, one per thing that can drift, reported at once: the fan-out is the feature.
  // It resolves by giving each check a result type, not by removing a check.
  { path: "src/contexts/framework/application/doctor/doctor-use-case.ts", injected: 7 },
  // `setup` brings a project from nothing to correct, so it names each stage: registration,
  // tool install, plugin prompt, settings sync, version, plus the machine-scope handoff.
  { path: "src/contexts/framework/application/setup-use-case.ts", injected: 11 },
  // Five section generators reached inline through a switch on section name, plus the config
  // generator. It resolves by registering a generator per section type, not by dropping one.
  {
    path: "src/contexts/framework/application/restore/generate-tool-distribution-use-case.ts",
    injected: 9,
  },
  {
    path: "src/contexts/framework/application/flows/marketplace-sync-settings-use-case.ts",
    injected: 12,
  },
  { path: "src/contexts/framework/application/restore/restore-use-case.ts", injected: 12 },
  // Carries `hostPluginRegistries`, the host's own registry reader per `AiToolId`, so the
  // scope asked for when uninstalling a ref is the one the host actually registered it at.
  { path: "src/contexts/framework/application/clean-use-case.ts", injected: 11 },
  // The machine-scope counterpart of `clean-use-case.ts`, same shape and same reason.
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
  // Carries `clean`'s own shared-source guard as well, so `plugin remove` in one project
  // cannot disable a plugin another project on the same machine still needs.
  { path: "src/contexts/framework/application/plugin/plugin-remove-use-case.ts", injected: 7 },
];

/**
 * Every constructor parameter counts, required or optional and whatever its type is named,
 * plus each `new XUseCase(...)` a method reaches for, deduped by class name within each.
 */
function injectedUseCaseCount(source: string): number {
  const signature = /constructor\((.*?)\)\s*\{/s.exec(source);
  const paramCount = signature
    ? [...signature[1].matchAll(/private readonly \w+\??:\s*[\w<>[\]| ]+/g)].length
    : 0;
  const inlineNames = new Set([...source.matchAll(/new (\w+UseCase)\(/g)].map((m) => m[1]));
  return paramCount + inlineNames.size;
}

function isUseCase(file: string): boolean {
  return /^src\/contexts\/[^/]+\/application\//.test(file);
}

function overLimit(source: string): boolean {
  return injectedUseCaseCount(source) > MAX_INJECTED_USE_CASES;
}

describe("orchestrators depend on entry points, not on parts", () => {
  it(`no use case injects more than ${MAX_INJECTED_USE_CASES} other use cases`, () => {
    const candidates = sourceFiles().filter(isUseCase);
    // A rule that selects nothing passes forever: this filter named a tree the files left.
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

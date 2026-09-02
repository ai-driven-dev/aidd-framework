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

/** Orchestrators that exceed the limit today. This list may only shrink. */
const BASELINE = [
  "src/contexts/framework/application/doctor/doctor-use-case.ts",
  "src/contexts/framework/application/setup-use-case.ts",
];

function injectedUseCaseCount(source: string): number {
  const signature = /constructor\((.*?)\)\s*\{/s.exec(source);
  if (!signature) return 0;
  const params = [...signature[1].matchAll(/private readonly \w+:\s*([\w<>[\]| ]+)/g)];
  return params.filter((param) => param[1].includes("UseCase")).length;
}

/** Where a use case lives: inside a context's application layer, or the flat tree left over. */
function isUseCase(file: string): boolean {
  return (
    /^src\/contexts\/[^/]+\/application\//.test(file) ||
    file.startsWith("src/application/use-cases/")
  );
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

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "orchestrator reaching inside the areas it crosses").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
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

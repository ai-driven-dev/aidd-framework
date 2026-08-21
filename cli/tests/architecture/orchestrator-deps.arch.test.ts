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
  "src/application/use-cases/doctor/doctor-use-case.ts",
  "src/application/use-cases/setup-use-case.ts",
];

function injectedUseCaseCount(source: string): number {
  const signature = /constructor\((.*?)\)\s*\{/s.exec(source);
  if (!signature) return 0;
  const params = [...signature[1].matchAll(/private readonly \w+:\s*([\w<>[\]| ]+)/g)];
  return params.filter((param) => param[1].includes("UseCase")).length;
}

describe("orchestrators depend on entry points, not on parts", () => {
  it(`no use case injects more than ${MAX_INJECTED_USE_CASES} other use cases`, () => {
    const violations = sourceFiles()
      .filter((file) => file.startsWith("src/application/use-cases/"))
      .filter((file) => injectedUseCaseCount(read(file)) > MAX_INJECTED_USE_CASES);

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "orchestrator reaching inside the areas it crosses").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });
});

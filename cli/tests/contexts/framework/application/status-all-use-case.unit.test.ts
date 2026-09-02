import { describe, expect, it, vi } from "vitest";
import { StatusAllUseCase } from "../../../../src/contexts/framework/application/global/status-all-use-case.js";
import type { StatusUseCase } from "../../../../src/contexts/framework/application/status-use-case.js";

const PROJECT_ROOT = "/test-project";

type Report = Awaited<ReturnType<StatusUseCase["execute"]>>;
type Options = Parameters<StatusUseCase["execute"]>[0];

const DRIFT = [{ toolId: "claude" as const, pluginName: "sample", driftedFiles: ["a.md"] }];

function report(over: Partial<Report> = {}): Report {
  return { tools: [], pluginDrift: [], inSync: true, ...over } as Report;
}

function fakeStatus(byCategory: (o: Options) => Report) {
  const calls: Options[] = [];
  const useCase = {
    execute: vi.fn(async (o: Options) => {
      calls.push(o);
      return byCategory(o);
    }),
  } as unknown as StatusUseCase;
  return { useCase, calls };
}

describe("StatusAllUseCase", () => {
  it("queries each category exactly once and never runs an unscoped pass", async () => {
    const { useCase, calls } = fakeStatus(() => report());

    await new StatusAllUseCase(useCase).execute(PROJECT_ROOT);

    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.category)).toEqual(["ai", "ide"]);
    expect(calls.every((c) => c.category !== undefined)).toBe(true);
  });

  it("reports plugin drift from the ai scope, which is where plugins live", async () => {
    const { useCase } = fakeStatus((o) =>
      o.category === "ai" ? report({ pluginDrift: DRIFT, inSync: false }) : report()
    );

    const result = await new StatusAllUseCase(useCase).execute(PROJECT_ROOT);

    expect(result.pluginDrift).toEqual(DRIFT);
  });

  it("falls back to no plugin drift when the ai scope failed", async () => {
    const { useCase } = fakeStatus((o) => {
      if (o.category === "ai") throw new Error("ai scope exploded");
      return report();
    });

    const result = await new StatusAllUseCase(useCase).execute(PROJECT_ROOT);

    expect(result.pluginDrift).toEqual([]);
    expect(result.errors.map((e) => e.scope)).toEqual(["ai"]);
  });
});

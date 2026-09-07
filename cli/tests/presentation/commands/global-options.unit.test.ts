import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseScopeFlag } from "../../../src/presentation/commands/global-options.js";
import type { CLIOutput } from "../../../src/presentation/output.js";

function createMockOutput(): CLIOutput {
  return {
    verbose: false,
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    print: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  };
}

/** Same shape `error-handler.unit.test.ts` uses: `process.exit` returns `never`, so a
 * double that returns normally lets a test walk through code the real process would
 * never reach. Throwing is what "does not return" looks like in-process. */
class ProcessExited extends Error {
  constructor(readonly code: number | string | null | undefined) {
    super(`process.exit(${String(code)})`);
  }
}

describe("parseScopeFlag()", () => {
  let output: CLIOutput;

  beforeEach(() => {
    output = createMockOutput();
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new ProcessExited(code);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined when no flag was given", () => {
    expect(parseScopeFlag(undefined, output)).toBeUndefined();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("passes project through", () => {
    expect(parseScopeFlag("project", output)).toBe("project");
  });

  it("passes user through", () => {
    expect(parseScopeFlag("user", output)).toBe("user");
  });

  it("exits 1 with an instructive message on anything else", () => {
    expect(() => parseScopeFlag("machine", output)).toThrow(ProcessExited);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('"machine"'));
  });
});

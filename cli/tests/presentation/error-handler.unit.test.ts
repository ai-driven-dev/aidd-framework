import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, InputRequiredError } from "../../src/kernel/errors.js";
import { ErrorHandler } from "../../src/presentation/error-handler.js";
import type { CLIOutput } from "../../src/presentation/output.js";

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

/**
 * `process.exit` returns `never`, and so does `ErrorHandler.handle`. A double that returns
 * normally cannot honestly be typed as either, and it lets a test walk through code the
 * real process would never reach. Throwing is what "does not return" looks like in-process.
 */
class ProcessExited extends Error {
  constructor(readonly code: number | string | null | undefined) {
    super(`process.exit(${String(code)})`);
  }
}

describe("ErrorHandler", () => {
  let output: CLIOutput;
  let handler: ErrorHandler;

  /** Asserts the handler ran to the exit it promises, and hands the test the rest. */
  function handling(error: unknown): void {
    expect(() => handler.handle(error)).toThrow(ProcessExited);
  }

  beforeEach(() => {
    output = createMockOutput();
    handler = new ErrorHandler(output);
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new ProcessExited(code);
    });
  });

  it("routes AuthenticationError message to output.error", () => {
    handling(new AuthenticationError("HTTP 401"));

    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining("Authentication failed (HTTP 401)")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("routes InputRequiredError message to output.error", () => {
    handling(new InputRequiredError("--tools flag is required"));

    expect(output.error).toHaveBeenCalledWith("--tools flag is required");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("falls back to error.message for unknown Error subclasses", () => {
    handling(new Error("unexpected failure"));

    expect(output.error).toHaveBeenCalledWith("unexpected failure");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("falls back to String(value) for non-Error values", () => {
    handling("raw string error");

    expect(output.error).toHaveBeenCalledWith("raw string error");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("falls back to String(value) for numeric values", () => {
    handling(42);

    expect(output.error).toHaveBeenCalledWith("42");
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});

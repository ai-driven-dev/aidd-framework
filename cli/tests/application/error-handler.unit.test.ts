import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorHandler } from "../../src/application/error-handler.js";
import { InputRequiredError } from "../../src/application/errors.js";
import type { CLIOutput } from "../../src/application/output.js";
import { AuthenticationError } from "../../src/domain/errors.js";

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

describe("ErrorHandler", () => {
  let output: CLIOutput;
  let handler: ErrorHandler;

  beforeEach(() => {
    output = createMockOutput();
    handler = new ErrorHandler(output);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("routes AuthenticationError message to output.error", () => {
    handler.handle(new AuthenticationError("HTTP 401"));

    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining("Authentication failed (HTTP 401)")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("routes InputRequiredError message to output.error", () => {
    handler.handle(new InputRequiredError("--tools flag is required"));

    expect(output.error).toHaveBeenCalledWith("--tools flag is required");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("falls back to error.message for unknown Error subclasses", () => {
    handler.handle(new Error("unexpected failure"));

    expect(output.error).toHaveBeenCalledWith("unexpected failure");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("falls back to String(value) for non-Error values", () => {
    handler.handle("raw string error");

    expect(output.error).toHaveBeenCalledWith("raw string error");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("falls back to String(value) for numeric values", () => {
    handler.handle(42);

    expect(output.error).toHaveBeenCalledWith("42");
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});

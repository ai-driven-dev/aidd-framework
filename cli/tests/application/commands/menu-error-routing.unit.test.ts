import { afterEach, describe, expect, it, vi } from "vitest";
import { routeMenuError } from "../../../src/application/commands/menu.js";
import type { ErrorHandler } from "../../../src/application/error-handler.js";

/** Makes the `never` return observable — both routing branches call process.exit. */
class ProcessExited extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

function stubExit() {
  return vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new ProcessExited(typeof code === "number" ? code : 0);
  });
}

function recordingErrorHandler(): ErrorHandler & { received: unknown[] } {
  const received: unknown[] = [];
  return {
    received,
    handle(error: unknown): never {
      received.push(error);
      throw new ProcessExited(1);
    },
  } as ErrorHandler & { received: unknown[] };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("routeMenuError", () => {
  it("exits 0 without reporting when the user aborts a prompt (Ctrl-C)", () => {
    stubExit();
    const errorHandler = recordingErrorHandler();
    const abort = Object.assign(new Error("prompt aborted"), { name: "ExitPromptError" });

    expect(() => routeMenuError(abort, errorHandler)).toThrow(ProcessExited);
    try {
      routeMenuError(abort, errorHandler);
    } catch (err) {
      expect((err as ProcessExited).code).toBe(0);
    }
    expect(errorHandler.received).toHaveLength(0);
  });

  it("reports any other error through the ErrorHandler instead of swallowing it", () => {
    stubExit();
    const errorHandler = recordingErrorHandler();
    const failure = new Error("manifest is corrupt");

    expect(() => routeMenuError(failure, errorHandler)).toThrow(ProcessExited);
    expect(errorHandler.received).toEqual([failure]);
  });

  it("reports non-Error throws too, rather than treating them as an abort", () => {
    stubExit();
    const errorHandler = recordingErrorHandler();

    expect(() => routeMenuError("boom", errorHandler)).toThrow(ProcessExited);
    expect(errorHandler.received).toEqual(["boom"]);
  });

  it("does not treat a same-message Error as an abort — only the ExitPromptError name", () => {
    stubExit();
    const errorHandler = recordingErrorHandler();
    const lookalike = new Error("ExitPromptError");

    expect(() => routeMenuError(lookalike, errorHandler)).toThrow(ProcessExited);
    expect(errorHandler.received).toEqual([lookalike]);
  });
});

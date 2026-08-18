import { describe, expect, it } from "vitest";
import { parseTelemetryScope } from "../../../src/application/commands/telemetry.js";
import { InvalidTelemetryScopeError } from "../../../src/application/errors.js";

// `telemetry on`'s .action() callback delegates every decision to TelemetryOnUseCase — the
// one piece of judgement left in the command layer is validating the `--scope` flag's
// shape, extracted here so it is testable on its own, the same way menu.ts exports
// `routeMenuError` for direct testing rather than leaving branching inline in an action
// callback.
describe("parseTelemetryScope", () => {
  it("defaults to local when no --scope is given", () => {
    expect(parseTelemetryScope(undefined)).toBe("local");
  });

  it("accepts local, project, and user verbatim", () => {
    expect(parseTelemetryScope("local")).toBe("local");
    expect(parseTelemetryScope("project")).toBe("project");
    expect(parseTelemetryScope("user")).toBe("user");
  });

  it("rejects anything else with a typed, catchable error", () => {
    expect(() => parseTelemetryScope("global")).toThrow(InvalidTelemetryScopeError);
    expect(() => parseTelemetryScope("")).toThrow(InvalidTelemetryScopeError);
  });
});

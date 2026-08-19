import { describe, expect, it } from "vitest";
import {
  parseTelemetryReceivePort,
  parseTelemetryScope,
} from "../../../src/application/commands/telemetry.js";
import {
  InvalidTelemetryReceivePortError,
  InvalidTelemetryScopeError,
} from "../../../src/application/errors.js";

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

describe("parseTelemetryReceivePort", () => {
  it("accepts the OTLP/HTTP default and other valid ports", () => {
    expect(parseTelemetryReceivePort("4318")).toBe(4318);
    expect(parseTelemetryReceivePort("0")).toBe(0);
    expect(parseTelemetryReceivePort("65535")).toBe(65535);
  });

  it("rejects anything that is not an integer in range, with a typed, catchable error", () => {
    expect(() => parseTelemetryReceivePort("not-a-port")).toThrow(InvalidTelemetryReceivePortError);
    expect(() => parseTelemetryReceivePort("-1")).toThrow(InvalidTelemetryReceivePortError);
    expect(() => parseTelemetryReceivePort("65536")).toThrow(InvalidTelemetryReceivePortError);
    expect(() => parseTelemetryReceivePort("4318.5")).toThrow(InvalidTelemetryReceivePortError);
  });
});

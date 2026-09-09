import { describe, expect, it } from "vitest";
import {
  buildTelemetryAllowedSetup,
  detectHookManager,
} from "../../../../src/contexts/telemetry/domain/telemetry-setup.js";

const SWITCH_PATH = "/repo/.aidd/config.json";

describe("buildTelemetryAllowedSetup — whose choice this was", () => {
  it("reads a project's own switch, turned on, as the project's decision", () => {
    const setup = buildTelemetryAllowedSetup(
      { path: SWITCH_PATH, enabled: true, readable: true },
      {}
    );
    expect(setup).toEqual({
      allowed: true,
      decidedBy: "project-switch",
      location: SWITCH_PATH,
      readable: true,
    });
  });

  it("reads a project never switched on as the project's own decision, not a refusal", () => {
    const setup = buildTelemetryAllowedSetup(
      { path: SWITCH_PATH, enabled: false, readable: true },
      {}
    );
    expect(setup.allowed).toBe(false);
    expect(setup.decidedBy).toBe("project-switch");
  });

  it("reads AIDD_TELEMETRY=0 as this person's own refusal, whatever the project file says", () => {
    const setup = buildTelemetryAllowedSetup(
      { path: SWITCH_PATH, enabled: true, readable: true },
      { AIDD_TELEMETRY: "0" }
    );
    expect(setup).toEqual({
      allowed: false,
      decidedBy: "person-refusal",
      location: "AIDD_TELEMETRY",
      readable: true,
    });
  });

  it("never lets a damaged switch file masquerade as a refusal", () => {
    const setup = buildTelemetryAllowedSetup(
      { path: SWITCH_PATH, enabled: false, readable: false },
      {}
    );
    expect(setup.decidedBy).toBe("project-switch");
    expect(setup.readable).toBe(false);
  });

  it("reads a person's refusal as always readable — an env var never fails to read", () => {
    const setup = buildTelemetryAllowedSetup(
      { path: SWITCH_PATH, enabled: false, readable: false },
      { AIDD_TELEMETRY: "0" }
    );
    expect(setup.readable).toBe(true);
  });

  it("never treats an unset AIDD_TELEMETRY as a refusal", () => {
    const setup = buildTelemetryAllowedSetup(
      { path: SWITCH_PATH, enabled: true, readable: true },
      { AIDD_TELEMETRY: "" }
    );
    expect(setup.decidedBy).toBe("project-switch");
  });
});

/** From root marker files alone: a manager regenerates `prepare-commit-msg` from its own
 * config on every install, so the hook's own contents say nothing by the time this runs. */
describe("detectHookManager — which manager owns prepare-commit-msg, from the root alone", () => {
  it("reads lefthook.yml as lefthook", () => {
    expect(detectHookManager(["lefthook.yml"])).toBe("lefthook");
  });

  it("reads every dot-prefixed and .yaml spelling lefthook itself accepts", () => {
    expect(detectHookManager([".lefthook.yaml"])).toBe("lefthook");
    expect(detectHookManager(["lefthook.yaml"])).toBe("lefthook");
    expect(detectHookManager([".lefthook.yml"])).toBe("lefthook");
  });

  it("reads .husky as husky", () => {
    expect(detectHookManager([".husky"])).toBe("husky");
  });

  it("prefers lefthook when both markers are present — a deterministic, documented tie-break", () => {
    expect(detectHookManager(["lefthook.yml", ".husky"])).toBe("lefthook");
  });

  it("names neither manager when no marker is present", () => {
    expect(detectHookManager([])).toBeUndefined();
    expect(detectHookManager(["package.json", "README.md"])).toBeUndefined();
  });
});

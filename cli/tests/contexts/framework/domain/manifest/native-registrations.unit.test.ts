import { describe, expect, it } from "vitest";
import {
  type NativeRegistrations,
  parseNativeRegistrations,
  toNativeRegistrationsData,
} from "../../../../../src/contexts/framework/domain/manifest/native-registrations.js";

const registrations: NativeRegistrations = {
  binary: "claude",
  marketplaces: [{ alias: "aidd-framework", hostName: "ai-driven-dev" }],
  pluginRefs: ["aidd-context@ai-driven-dev"],
};

describe("native registrations — what a tool's own CLI was asked to register", () => {
  describe("serialized", () => {
    it("carries the binary, every marketplace pair and every plugin ref", () => {
      expect(toNativeRegistrationsData(registrations)).toStrictEqual({
        binary: "claude",
        marketplaces: [{ alias: "aidd-framework", hostName: "ai-driven-dev" }],
        pluginRefs: ["aidd-context@ai-driven-dev"],
      });
    });
  });

  describe("parsed", () => {
    it("reads back the binary, every marketplace pair and every plugin ref", () => {
      expect(
        parseNativeRegistrations({
          binary: "codex",
          marketplaces: [{ alias: "local", hostName: "declared" }],
          pluginRefs: ["a@declared", "b@declared"],
        })
      ).toStrictEqual({
        binary: "codex",
        marketplaces: [{ alias: "local", hostName: "declared" }],
        pluginRefs: ["a@declared", "b@declared"],
      });
    });
  });
});

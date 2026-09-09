import { describe, expect, it } from "vitest";
import { bestEffortNativeCall } from "../../../../../src/contexts/framework/application/shared/best-effort-native-call.js";
import { NativePluginCliError } from "../../../../../src/kernel/errors.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";

describe("bestEffortNativeCall", () => {
  it("warns and reports a call the host's own CLI refused", () => {
    const logger = new CapturingLogger();

    const completed = bestEffortNativeCall(
      logger,
      () => {
        throw new NativePluginCliError("exit 1");
      },
      "claude marketplace remove"
    );

    expect(completed).toBe(false);
    expect(logger.warnMessages).toStrictEqual(["claude marketplace remove failed: exit 1"]);
  });

  it("propagates any failure that is not the host CLI refusing", () => {
    expect(() =>
      bestEffortNativeCall(
        new CapturingLogger(),
        () => {
          throw new Error("activator bug");
        },
        "claude marketplace remove"
      )
    ).toThrow("activator bug");
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_REQUESTED_VERSION_POLICY } from "../../../../../src/contexts/framework/domain/plugins/requested-version-policy.js";

describe("requested version policy", () => {
  it("holds a requested version strictly unless a caller relaxes it", () => {
    expect(DEFAULT_REQUESTED_VERSION_POLICY).toBe("strict");
  });
});

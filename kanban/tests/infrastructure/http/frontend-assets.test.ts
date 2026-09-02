import { describe, expect, it } from "vitest";

describe("frontend assets", () => {
  it("loads the module without reading the filesystem at import time", async () => {
    const assetsModule = await import("../../../src/infrastructure/http/frontend-assets.js");

    expect(typeof assetsModule.readFrontendAssets).toBe("function");
  });
});

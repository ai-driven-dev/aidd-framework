import { describe, expect, it } from "vitest";
import {
  printAuthenticated,
  printAuthStatus,
  printLogoutResult,
} from "../../../src/presentation/display/auth-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

describe("printAuthenticated", () => {
  it("names the login and the level it was stored at", () => {
    const output = new CapturingOutput(false);

    printAuthenticated(output, "octocat", "user");

    expect(output.at("success")).toEqual(["Authenticated as octocat (user)"]);
  });
});

describe("printAuthStatus", () => {
  it("says not authenticated when no credential resolved", () => {
    const output = new CapturingOutput(false);

    printAuthStatus(output, { authenticated: false });

    expect(output.captured).toEqual([{ level: "info", message: "Not authenticated." }]);
  });

  it("names the login and its level when one resolved", () => {
    const output = new CapturingOutput(false);

    printAuthStatus(output, { authenticated: true, login: "octocat", level: "project" });

    expect(output.captured).toEqual([
      { level: "success", message: "Authenticated as octocat (project)" },
    ]);
  });
});

describe("printLogoutResult", () => {
  it("says not authenticated when there was nothing to remove", () => {
    const output = new CapturingOutput(false);

    printLogoutResult(output, { found: false });

    expect(output.captured).toEqual([{ level: "info", message: "Not authenticated." }]);
  });

  it("confirms the level a stored credential was removed from", () => {
    const output = new CapturingOutput(false);

    printLogoutResult(output, { found: true, level: "user" });

    expect(output.captured).toEqual([{ level: "success", message: "Logged out (user)" }]);
  });

  it("points at the external provider's own logout before confirming", () => {
    const output = new CapturingOutput(false);

    printLogoutResult(output, {
      found: true,
      level: "project",
      hint: "external-provider-cleanup",
    });

    expect(output.captured).toEqual([
      {
        level: "info",
        message:
          "To fully logout, run the external provider's logout command (e.g. gh auth logout).",
      },
      { level: "success", message: "Logged out (project)" },
    ]);
  });
});

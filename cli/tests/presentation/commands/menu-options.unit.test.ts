import { describe, expect, it } from "vitest";
import { isUserAbort } from "../../../src/presentation/commands/menu.js";

describe("isUserAbort", () => {
  it("recognises the error inquirer throws on Ctrl-C", () => {
    expect(isUserAbort(Object.assign(new Error("aborted"), { name: "ExitPromptError" }))).toBe(
      true
    );
  });

  it("reads any other Error as a genuine failure", () => {
    expect(isUserAbort(new Error("manifest is corrupt"))).toBe(false);
  });

  it("reads the name, not the message, so a lookalike message is no abort", () => {
    expect(isUserAbort(new Error("ExitPromptError"))).toBe(false);
  });

  it("reads a non-Error throw as a failure rather than an abort", () => {
    expect(isUserAbort({ name: "ExitPromptError" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { printBanner } from "../../../src/presentation/display/menu-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

describe("printBanner", () => {
  it("prints the ASCII wordmark under a blank line, ending on the product name", () => {
    const output = new CapturingOutput(false);

    printBanner(output);

    expect(output.captured).toEqual([
      {
        level: "print",
        message:
          "\n   _    ___ ___  ___\n  /_\\  |_ _|   \\|   \\\n / _ \\  | || |) | |) |\n/_/ \\_\\|___|___/|___/\n\n AI-Driven Development CLI",
      },
    ]);
  });
});

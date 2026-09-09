import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { supportedBuildTargets } from "../../../src/contexts/translate/domain/build-target.js";
import { registerTranslateCommand } from "../../../src/presentation/commands/translate.js";

/**
 * The help text names targets in prose nothing derives, while the validation beside it reads
 * the profiles. Asserting the set, not the sentence, leaves the wording free.
 */
describe("translate --to help text", () => {
  it("names exactly the targets the command accepts", () => {
    const program = new Command();
    registerTranslateCommand(program);

    const translate = program.commands.find((command) => command.name() === "translate");
    const description = translate?.options.find((option) => option.long === "--to")?.description;

    const named = [...(description ?? "").matchAll(/[a-z][a-z-]+/g)]
      .map((match) => match[0])
      .filter((word) => (supportedBuildTargets() as readonly string[]).includes(word));

    expect([...named].sort()).toEqual([...supportedBuildTargets()].sort());
  });
});

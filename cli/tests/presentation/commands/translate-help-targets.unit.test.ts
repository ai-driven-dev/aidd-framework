import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { supportedBuildTargets } from "../../../src/contexts/translate/domain/build-target.js";
import { registerTranslateCommand } from "../../../src/presentation/commands/translate.js";

/**
 * `--to`'s help text names the targets in prose, which nothing derives and nothing else
 * reads. The validation right below it reads the profiles, so the two can drift: a sixth
 * tool would be accepted by the command and absent from the help that announces it.
 *
 * Asserting the set rather than the sentence keeps the wording free while making the
 * omission fail.
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

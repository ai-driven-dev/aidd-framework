import { describe, expect, it } from "vitest";
import { ResolveRestoreDecisionUseCase } from "../../../../../src/contexts/framework/application/restore/resolve-restore-decision.js";
import { InputRequiredError } from "../../../../../src/kernel/errors.js";
import { ScriptedPrompter } from "../../../../helpers/ports/scripted-prompter.js";

const PATH = "a.md";

function neverAsked(): ScriptedPrompter {
  return new ScriptedPrompter([]);
}

describe("ResolveRestoreDecisionUseCase", () => {
  it("restores a deleted file without asking, whatever the mode", async () => {
    const useCase = new ResolveRestoreDecisionUseCase(neverAsked());

    const keep = await useCase.execute({
      relativePath: PATH,
      reason: "deleted",
      force: false,
      interactive: false,
    });

    expect(keep).toBe(false);
  });

  it("refuses a modified file when it can neither force nor ask", async () => {
    const useCase = new ResolveRestoreDecisionUseCase(neverAsked());

    await expect(
      useCase.execute({ relativePath: PATH, reason: "modified", force: false, interactive: false })
    ).rejects.toThrow(
      new InputRequiredError("Use --force to overwrite modified files in non-interactive mode.")
    );
  });

  it("asks about a modified file when it may ask but not force", async () => {
    const useCase = new ResolveRestoreDecisionUseCase(
      new ScriptedPrompter([ScriptedPrompter.answer.conflict("keep")])
    );

    const keep = await useCase.execute({
      relativePath: PATH,
      reason: "modified",
      force: false,
      interactive: true,
    });

    expect(keep).toBe(true);
  });

  it("overwrites a modified file without asking when forced, even where it could ask", async () => {
    const useCase = new ResolveRestoreDecisionUseCase(neverAsked());

    const keep = await useCase.execute({
      relativePath: PATH,
      reason: "modified",
      force: true,
      interactive: true,
    });

    expect(keep).toBe(false);
  });

  it("overwrites a modified file without asking when forced with no one to ask", async () => {
    const useCase = new ResolveRestoreDecisionUseCase(neverAsked());

    const keep = await useCase.execute({
      relativePath: PATH,
      reason: "modified",
      force: true,
      interactive: false,
    });

    expect(keep).toBe(false);
  });
});

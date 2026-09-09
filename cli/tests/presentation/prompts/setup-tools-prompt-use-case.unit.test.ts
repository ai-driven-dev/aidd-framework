import { describe, expect, it } from "vitest";
import { SetupToolsPromptUseCase } from "../../../src/presentation/prompts/setup-tools-prompt-use-case.js";
import { ScriptedPrompter } from "../../helpers/ports/scripted-prompter.js";

describe("SetupToolsPromptUseCase", () => {
  describe("non-interactive mode", () => {
    it("returns flow tools unchanged without prompting", async () => {
      const prompter = new ScriptedPrompter([]); // no prompts expected
      const useCase = new SetupToolsPromptUseCase(prompter);

      const result = await useCase.execute({
        interactive: false,
        aiTools: [],
        ideTools: [],
      });

      expect(result.aiTools).toEqual([]);
      expect(result.ideTools).toEqual([]);
    });
  });

  describe("interactive mode with tools already provided", () => {
    it("returns provided tools without prompting when flags given", async () => {
      const prompter = new ScriptedPrompter([]); // no prompts expected
      const useCase = new SetupToolsPromptUseCase(prompter);

      const result = await useCase.execute({
        interactive: true,
        aiTools: ["claude"],
        ideTools: [],
      });

      expect(result.aiTools).toEqual(["claude"]);
      expect(result.ideTools).toEqual([]);
    });

    it("returns provided ide tools without prompting", async () => {
      const prompter = new ScriptedPrompter([]); // no prompts expected
      const useCase = new SetupToolsPromptUseCase(prompter);

      const result = await useCase.execute({
        interactive: true,
        aiTools: [],
        ideTools: ["vscode"],
      });

      expect(result.aiTools).toEqual([]);
      expect(result.ideTools).toEqual(["vscode"]);
    });
  });

  describe("interactive mode with no tools provided", () => {
    it("prompts and returns user-selected tools", async () => {
      const prompter = new ScriptedPrompter([
        ScriptedPrompter.answer.checkbox(["claude", "cursor"]),
        ScriptedPrompter.answer.checkbox(["vscode"]),
      ]);
      const useCase = new SetupToolsPromptUseCase(prompter);

      const result = await useCase.execute({
        interactive: true,
        aiTools: [],
        ideTools: [],
      });

      expect(result.aiTools).toEqual(["claude", "cursor"]);
      expect(result.ideTools).toEqual(["vscode"]);
    });

    it("prompts and returns empty arrays when user selects nothing", async () => {
      const prompter = new ScriptedPrompter([
        ScriptedPrompter.answer.checkbox([]),
        ScriptedPrompter.answer.checkbox([]),
      ]);
      const useCase = new SetupToolsPromptUseCase(prompter);

      const result = await useCase.execute({
        interactive: true,
        aiTools: [],
        ideTools: [],
      });

      expect(result.aiTools).toEqual([]);
      expect(result.ideTools).toEqual([]);
    });
  });
});

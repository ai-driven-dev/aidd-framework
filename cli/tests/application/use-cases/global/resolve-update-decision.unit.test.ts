import { describe, expect, it, vi } from "vitest";
import { InputRequiredError } from "../../../../src/application/errors.js";
import {
  BulkConflictState,
  ResolveUpdateDecisionUseCase,
} from "../../../../src/application/use-cases/global/resolve-update-decision-use-case.js";
import type { Prompter } from "../../../../src/domain/ports/prompter.js";

function buildFakePrompter(
  resolveConflictBulkReturn: "keep" | "overwrite" | "overwrite-all" | "skip-all"
): Prompter {
  return {
    resolveConflict: vi.fn(),
    resolveConflictBulk: vi.fn().mockResolvedValue(resolveConflictBulkReturn),
    confirm: vi.fn(),
    input: vi.fn(),
    select: vi.fn(),
    checkbox: vi.fn(),
  } as unknown as Prompter;
}

describe("ResolveUpdateDecisionUseCase", () => {
  describe("non-TTY without force", () => {
    it("throws InputRequiredError for modified file", async () => {
      const prompter = buildFakePrompter("overwrite");
      const useCase = new ResolveUpdateDecisionUseCase(prompter);

      await expect(
        useCase.execute({
          relativePath: "some/file.md",
          userForce: false,
          interactive: false,
          bulkState: new BulkConflictState(),
        })
      ).rejects.toThrow(InputRequiredError);
    });

    it("never calls prompter in non-TTY mode", async () => {
      const prompter = buildFakePrompter("overwrite");
      const useCase = new ResolveUpdateDecisionUseCase(prompter);

      await expect(
        useCase.execute({
          relativePath: "some/file.md",
          userForce: false,
          interactive: false,
          bulkState: new BulkConflictState(),
        })
      ).rejects.toThrow();

      expect(prompter.resolveConflictBulk).not.toHaveBeenCalled();
    });
  });

  describe("force mode", () => {
    it("returns true (overwrite) without prompting when force=true", async () => {
      const prompter = buildFakePrompter("keep");
      const useCase = new ResolveUpdateDecisionUseCase(prompter);

      const result = await useCase.execute({
        relativePath: "some/file.md",
        userForce: true,
        interactive: false,
        bulkState: new BulkConflictState(),
      });

      expect(result).toBe(true);
      expect(prompter.resolveConflictBulk).not.toHaveBeenCalled();
    });

    it("returns true even when not interactive", async () => {
      const prompter = buildFakePrompter("keep");
      const useCase = new ResolveUpdateDecisionUseCase(prompter);

      const result = await useCase.execute({
        relativePath: "some/file.md",
        userForce: true,
        interactive: false,
        bulkState: new BulkConflictState(),
      });

      expect(result).toBe(true);
    });
  });

  describe("interactive mode without force", () => {
    it("returns true (overwrite) when prompter returns overwrite", async () => {
      const prompter = buildFakePrompter("overwrite");
      const useCase = new ResolveUpdateDecisionUseCase(prompter);

      const result = await useCase.execute({
        relativePath: "some/file.md",
        userForce: false,
        interactive: true,
        bulkState: new BulkConflictState(),
      });

      expect(result).toBe(true);
      expect(prompter.resolveConflictBulk).toHaveBeenCalledWith("some/file.md", "modified");
    });

    it("returns false (keep) when prompter returns keep", async () => {
      const prompter = buildFakePrompter("keep");
      const useCase = new ResolveUpdateDecisionUseCase(prompter);

      const result = await useCase.execute({
        relativePath: "some/file.md",
        userForce: false,
        interactive: true,
        bulkState: new BulkConflictState(),
      });

      expect(result).toBe(false);
      expect(prompter.resolveConflictBulk).toHaveBeenCalledWith("some/file.md", "modified");
    });
  });

  describe("bulk state", () => {
    it("short-circuits to overwrite when bulkState is overwrite-all (no prompt)", async () => {
      const prompter = buildFakePrompter("keep");
      const useCase = new ResolveUpdateDecisionUseCase(prompter);
      const bulkState = new BulkConflictState();
      bulkState.record("overwrite-all");

      const result = await useCase.execute({
        relativePath: "some/file.md",
        userForce: false,
        interactive: true,
        bulkState,
      });

      expect(result).toBe(true);
      expect(prompter.resolveConflictBulk).not.toHaveBeenCalled();
    });

    it("short-circuits to keep when bulkState is skip-all (no prompt)", async () => {
      const prompter = buildFakePrompter("overwrite");
      const useCase = new ResolveUpdateDecisionUseCase(prompter);
      const bulkState = new BulkConflictState();
      bulkState.record("skip-all");

      const result = await useCase.execute({
        relativePath: "some/file.md",
        userForce: false,
        interactive: true,
        bulkState,
      });

      expect(result).toBe(false);
      expect(prompter.resolveConflictBulk).not.toHaveBeenCalled();
    });

    it("records overwrite-all in bulkState when prompted", async () => {
      const prompter = buildFakePrompter("overwrite-all");
      const useCase = new ResolveUpdateDecisionUseCase(prompter);
      const bulkState = new BulkConflictState();

      const result = await useCase.execute({
        relativePath: "some/file.md",
        userForce: false,
        interactive: true,
        bulkState,
      });

      expect(result).toBe(true);
      expect(bulkState.get()).toBe("overwrite-all");
    });

    it("records skip-all in bulkState when prompted", async () => {
      const prompter = buildFakePrompter("skip-all");
      const useCase = new ResolveUpdateDecisionUseCase(prompter);
      const bulkState = new BulkConflictState();

      const result = await useCase.execute({
        relativePath: "some/file.md",
        userForce: false,
        interactive: true,
        bulkState,
      });

      expect(result).toBe(false);
      expect(bulkState.get()).toBe("skip-all");
    });
  });
});

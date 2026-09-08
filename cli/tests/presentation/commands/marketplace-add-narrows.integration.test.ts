/**
 * Lot 9, item C, the command side: `marketplace add <name>` must re-drive native
 * activation narrowed to the marketplace it just registered — never every registered
 * marketplace, which is what a bare `syncNativeActivation(deps, output, projectRoot)`
 * call (no fourth argument) would do. `marketplace remove | refresh` deliberately keep
 * that bare call (see `marketplace.ts`); this test pins `add` alone.
 */
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

const marketplaceSyncExecute = vi
  .fn()
  .mockResolvedValue({ activated: [], binaryMissing: [], warnings: [], errors: [] });
const marketplaceAddExecute = vi.fn().mockResolvedValue({ marketplace: { name: "market-b" } });

vi.mock("../../../src/runtime/wiring/framework.js", () => ({
  createDeps: vi.fn(async () => ({
    marketplaceAddUseCase: { execute: marketplaceAddExecute },
    marketplaceSyncSettingsUseCase: { execute: marketplaceSyncExecute },
    prompter: { input: vi.fn() },
  })),
  createMenuDeps: vi.fn(() => ({ prompter: { input: vi.fn(), select: vi.fn() } })),
}));

const { registerMarketplaceCommand } = await import(
  "../../../src/presentation/commands/marketplace.js"
);

describe("marketplace add narrows native activation to the marketplace it just registered", () => {
  it("passes marketplaceNames: [name] to MarketplaceSyncSettingsUseCase.execute", async () => {
    const program = new Command();
    program.exitOverride();
    registerMarketplaceCommand(program);

    await program.parseAsync(["node", "aidd", "marketplace", "add", "market-b", "/some/source"]);

    expect(marketplaceSyncExecute).toHaveBeenCalledWith(
      expect.objectContaining({ marketplaceNames: ["market-b"] })
    );
  });
});

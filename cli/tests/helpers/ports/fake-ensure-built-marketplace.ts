import type {
  EnsureBuiltMarketplaceOptions,
  EnsureBuiltMarketplaceUseCase,
} from "../../../src/contexts/framework/application/shared/ensure-built-marketplace-use-case.js";

/**
 * Stand-in for EnsureBuiltMarketplaceUseCase that returns a deterministic per-target
 * built dir without running a real framework build. Lets native/materialize tests
 * assert "install consumes the built tree" without disk I/O.
 */
export function fakeEnsureBuiltMarketplace(
  builtDirFor: (target: string) => string = (target) => `/built/${target}`
): EnsureBuiltMarketplaceUseCase {
  return {
    execute: async (options: EnsureBuiltMarketplaceOptions) => ({
      builtDir: builtDirFor(options.target),
      version: "test",
      rebuilt: true,
    }),
  } as unknown as EnsureBuiltMarketplaceUseCase;
}

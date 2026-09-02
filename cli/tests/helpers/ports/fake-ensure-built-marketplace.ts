import type {
  EnsureBuiltMarketplace,
  EnsureBuiltMarketplaceOptions,
} from "../../../src/application/use-cases/shared/ensure-built-marketplace-use-case.js";

/**
 * Stand-in for EnsureBuiltMarketplace that returns a deterministic per-target
 * built dir without running a real framework build. Lets native/materialize tests
 * assert "install consumes the built tree" without disk I/O.
 */
export function fakeEnsureBuiltMarketplace(
  builtDirFor: (target: string) => string = (target) => `/built/${target}`
): EnsureBuiltMarketplace {
  return {
    execute: async (options: EnsureBuiltMarketplaceOptions) => ({
      builtDir: builtDirFor(options.target),
      version: "test",
      rebuilt: true,
    }),
  };
}

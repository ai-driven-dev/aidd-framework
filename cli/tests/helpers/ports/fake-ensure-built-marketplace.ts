import type {
  EnsureBuiltMarketplace,
  EnsureBuiltMarketplaceOptions,
} from "../../../src/contexts/framework/application/shared/ensure-built-marketplace-use-case.js";

/** Stand-in for EnsureBuiltMarketplace returning a deterministic per-target built dir, so a
 * native or materialize test can consume a built tree without disk I/O. */
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

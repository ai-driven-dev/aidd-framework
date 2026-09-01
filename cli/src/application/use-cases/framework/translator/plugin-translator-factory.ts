import type { PluginsCapability } from "../../../../domain/capabilities/plugins-capability.js";
import type { FileReader } from "../../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../../domain/ports/hasher.js";
import type { MarketplaceRegistry } from "../../../../domain/ports/marketplace-registry.js";
import type { EnsureBuiltMarketplaceUseCase } from "../../shared/ensure-built-marketplace-use-case.js";
import { BuiltTreeMaterializationTranslator } from "./built-tree-materialization-translator.js";
import { ModeAMarketplaceTranslator } from "./mode-a-marketplace-translator.js";
import type { PluginTranslator } from "./plugin-translator.js";

export interface TranslatorDeps {
  fs: FileWriter & FileReader;
  hasher: Hasher;
  homedir: () => string;
  ensureBuilt: EnsureBuiltMarketplaceUseCase;
  marketplaceRegistry: MarketplaceRegistry;
}

/**
 * Resolves the appropriate translation adapter for a given PluginsCapability.
 *
 * Routing priority:
 * 1. `installScope === "user"` or `translationMode === "flat"` → BuiltTreeMaterializationTranslator
 *    (user-scope tools like Cursor; project-scope flat tools like OpenCode)
 * 2. `translationMode === "marketplace"` → ModeAMarketplaceTranslator (Mode A: register in native config)
 * 3. otherwise → null (neutral native or unsupported; no translation strategy applies)
 *
 * Materializing tools copy the per-target BUILT tree verbatim so installed bytes match
 * `framework build` output; raw local-path installs fall back to flat materialization.
 */
export function resolveTranslator(
  plugins: PluginsCapability,
  deps: TranslatorDeps
): PluginTranslator | null {
  if (plugins.installScope === "user" || plugins.translationMode === "flat") {
    return new BuiltTreeMaterializationTranslator(
      deps.fs,
      deps.hasher,
      deps.homedir,
      deps.ensureBuilt,
      deps.marketplaceRegistry
    );
  }
  if (plugins.translationMode === "marketplace") {
    return new ModeAMarketplaceTranslator();
  }
  return null;
}

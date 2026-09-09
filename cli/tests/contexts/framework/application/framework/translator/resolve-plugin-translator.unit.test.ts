import "../../../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import { describe, expect, it } from "vitest";
import type { TranslatorDeps } from "../../../../../../src/contexts/framework/application/framework/translator/plugin-translator-factory.js";
import { resolvePluginTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/resolve-plugin-translator.js";
import { getToolConfig } from "../../../../../../src/contexts/tools/domain/registry.js";
import { DeterministicHasher } from "../../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceRegistry } from "../../../../../helpers/ports/in-memory-marketplace-registry.js";

function deps(): TranslatorDeps {
  return {
    fs: new InMemoryFileAdapter(),
    hasher: new DeterministicHasher(),
    homedir: () => "/stub-home",
    ensureBuilt: fakeEnsureBuiltMarketplace(),
    marketplaceRegistry: new InMemoryMarketplaceRegistry(),
  };
}

describe("resolvePluginTranslator", () => {
  it("answers nothing for a tool that is not an AI tool", () => {
    expect(resolvePluginTranslator(getToolConfig("vscode"), deps())).toBeNull();
  });
});

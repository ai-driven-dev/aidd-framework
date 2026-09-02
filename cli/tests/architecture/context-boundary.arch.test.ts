/**
 * Nothing imports the interior of a context except through what it declares public.
 *
 * There is deliberately no `index.ts` anywhere — this codebase forbids barrels and
 * re-exports (`no-re-export.arch.test.ts`, base empty), so a context cannot hold its
 * boundary with a re-export file. It holds it here instead: a context is a directory
 * under `src/contexts/`, and an import from outside that directory may only target a
 * module the context lists below. Everything else inside it is internal, whether or
 * not anything currently reaches for it — the list is the fence, not a description of
 * what happens to be used.
 *
 * See `aidd_docs/tasks/2026_08/2026_08_20_refactor-contextes-cli/arborescence.md`,
 * invariant 4.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, importersByFile, sourceFiles } from "./helpers.js";

/**
 * Each context's declared public surface. Shaped so later phases only add data: one
 * entry per context, growing as `framework` and `distribution` are extracted, without
 * the mechanism below ever needing to change.
 */
const PUBLIC_MODULES: Readonly<Record<string, readonly string[]>> = {
  tools: [
    // the tool contract and lookup surface
    "src/contexts/tools/domain/contracts.ts",
    "src/contexts/tools/domain/registry.ts",
    "src/contexts/tools/domain/build-contract.ts",
    // co-owned configuration (settings.json, .mcp.json et al.) — phase 10's own mandate
    "src/contexts/tools/domain/mcp-capability.ts",
    "src/contexts/tools/domain/mcp-exclusion.ts",
    "src/contexts/tools/domain/settings-capability.ts",
    "src/contexts/tools/domain/capabilities/hooks-capability.ts",
    "src/contexts/tools/domain/capabilities/config-refs.ts",
    "src/contexts/tools/domain/formats/opencode-mcp-merge.ts",
    // ports a caller wires a concrete adapter into, or whose type it must accept
    "src/contexts/tools/domain/ports/file-merger.ts",
    "src/contexts/tools/domain/ports/native-plugin-activator.ts",
    "src/contexts/tools/domain/ports/schema-validator.ts",
    // the application layer — install/uninstall entry points
    "src/contexts/tools/application/install-ai-tool-use-case.ts",
    "src/contexts/tools/application/install-config-use-case.ts",
    "src/contexts/tools/application/install-ide-config-use-case.ts",
    "src/contexts/tools/application/install-ide-tool-use-case.ts",
    "src/contexts/tools/application/install-runtime-config-use-case.ts",
    "src/contexts/tools/application/uninstall-tools-use-case.ts",
  ],
  translate: [
    // the canonical shapes framework produces and translate consumes
    "src/contexts/translate/domain/canon.ts",
    "src/contexts/translate/domain/plugin-distribution.ts",
    "src/contexts/translate/domain/plugin-format.ts",
    "src/contexts/translate/domain/plugin-translation-skip.ts",
    "src/contexts/translate/domain/build-target.ts",
    // the translator itself — what this context is for
    "src/contexts/translate/domain/content-translator.ts",
    // the build use case — `framework build`, one source to N targets
    "src/contexts/translate/application/translate-source.ts",
  ],
  // Measured with the composition root excluded: ten modules are reached from outside,
  // and not one of them is an adapter. The adapters are wired by `deps.ts` alone, which
  // is why they stay internal — a leaf that exposed its own plumbing would not be one.
  distribution: [
    // what a marketplace is, and where it can be read from
    "src/contexts/distribution/domain/marketplace.ts",
    "src/contexts/distribution/domain/marketplace-source-mode.ts",
    "src/contexts/distribution/domain/catalog.ts",
    // the ports its callers hold, so they can be given an implementation
    "src/contexts/distribution/domain/ports/marketplace-registry.ts",
    "src/contexts/distribution/domain/ports/marketplace-trust-store.ts",
    "src/contexts/distribution/domain/ports/plugin-catalog-repository.ts",
    "src/contexts/distribution/domain/ports/plugin-fetcher.ts",
    // the three operations other contexts genuinely ask for
    "src/contexts/distribution/application/resolve-marketplace-use-case.ts",
    "src/contexts/distribution/application/marketplace-refresh-use-case.ts",
    "src/contexts/distribution/application/marketplace-register-framework-use-case.ts",
  ],
};

/** The context a file belongs to, or `null` when it is not inside any context yet. */
function contextOf(file: string): string | null {
  const match = /^src\/contexts\/([^/]+)\//.exec(file);
  return match ? match[1] : null;
}

/**
 * The composition root wires every context by construction: profiles register
 * themselves through a side-effect import, and a concrete adapter must be named to be
 * instantiated. Exempting it mirrors `earned-sharing.arch.test.ts`'s exemption of the
 * same file for the same reason — it is not a caller this rule is trying to catch.
 */
const COMPOSITION_ROOT = "src/infrastructure/deps.ts";

/** The rule itself, over an explicit file list and importer map instead of the real tree. */
function reachesIntoInterior(
  files: readonly string[],
  importers: ReadonlyMap<string, ReadonlySet<string>>,
  publicModules: Readonly<Record<string, readonly string[]>>
): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const owner = contextOf(file);
    if (owner === null || !(owner in publicModules)) continue;
    if (publicModules[owner].includes(file)) continue;
    for (const importer of importers.get(file) ?? []) {
      if (importer === COMPOSITION_ROOT) continue;
      if (contextOf(importer) === owner) continue;
      violations.push(`${importer} -> ${file}`);
    }
  }
  return violations.sort();
}

/**
 * Reaches into a context's interior today. This list may only shrink.
 *
 * The five `install-*-use-case.ts` files reach past `tools`' declared capability
 * contract for the capability *class* itself (agents/commands/rules/skills) — narrow
 * 1:1 couplings that predate this phase. `hooks-capability.ts` and
 * `opencode-mcp-merge.ts` are declared public instead of baselined here: measured,
 * their external callers are the same framework-side plugin-materialization files
 * that already reach the public `McpCapability`/`SettingsCapability` — the same
 * co-owned-configuration role phase 10 task 3 puts in `tools`, not a narrow reach.
 * These five entries resolve when `install/` moves into `contexts/tools/application/`,
 * which this phase does not do.
 *
 * `plugins-capability.ts` reaches `translate`'s `cursor-hooks.ts` for
 * `HooksContentFormat` — it declares a tool's hooks format, the same shape of problem
 * task 1 solved for the content capabilities, but `plugins-capability.ts` itself does
 * not move to `tools` in this phase, so the format transform it needs stays out of
 * reach until it does.
 */
const BASELINE = [
  "src/application/use-cases/install/install-agents-use-case.ts -> src/contexts/tools/domain/capabilities/agents-capability.ts",
  "src/application/use-cases/install/install-commands-use-case.ts -> src/contexts/tools/domain/capabilities/commands-capability.ts",
  "src/application/use-cases/install/install-content-section-use-case.ts -> src/contexts/tools/domain/formats/command.ts",
  "src/application/use-cases/install/install-rules-use-case.ts -> src/contexts/tools/domain/capabilities/rules-capability.ts",
  "src/application/use-cases/install/install-skills-use-case.ts -> src/contexts/tools/domain/capabilities/skills-capability.ts",
  "src/domain/capabilities/plugins-capability.ts -> src/contexts/translate/domain/formats/cursor-hooks.ts",
];

describe("nothing imports a context's interior", () => {
  it("every cross-context import targets a declared public module", () => {
    const violations = reachesIntoInterior(sourceFiles(), importersByFile(), PUBLIC_MODULES);

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "new import reaches a context's undeclared interior").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("flags a reach into a context's interior and clears one that targets its public surface", () => {
    const files = ["src/contexts/acme/domain/internal.ts", "src/contexts/acme/domain/public.ts"];
    const importers = new Map([
      ["src/contexts/acme/domain/internal.ts", new Set(["src/application/outsider.ts"])],
      ["src/contexts/acme/domain/public.ts", new Set(["src/application/outsider.ts"])],
    ]);
    const publicModules = { acme: ["src/contexts/acme/domain/public.ts"] };

    expect(reachesIntoInterior(files, importers, publicModules)).toEqual([
      "src/application/outsider.ts -> src/contexts/acme/domain/internal.ts",
    ]);
  });

  it("lets a context import its own interior freely, and exempts the composition root", () => {
    const files = ["src/contexts/acme/domain/internal.ts"];
    const importers = new Map([
      [
        "src/contexts/acme/domain/internal.ts",
        new Set(["src/contexts/acme/application/sibling.ts", "src/infrastructure/deps.ts"]),
      ],
    ]);
    const publicModules = { acme: [] };

    expect(reachesIntoInterior(files, importers, publicModules)).toEqual([]);
  });
});

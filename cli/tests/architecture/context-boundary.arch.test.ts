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
    "src/contexts/tools/domain/capabilities/mcp-capability.ts",
    "src/contexts/tools/domain/mcp-exclusion.ts",
    "src/contexts/tools/domain/capabilities/settings-capability.ts",
    "src/contexts/tools/domain/capabilities/hooks-capability.ts",
    "src/contexts/tools/domain/capabilities/config-refs.ts",
    "src/contexts/tools/domain/formats/opencode-mcp-merge.ts",
    // ports a caller wires a concrete adapter into, or whose type it must accept
    "src/contexts/tools/domain/ports/file-merger.ts",
    "src/contexts/tools/domain/ports/native-plugin-activator.ts",
    "src/contexts/tools/domain/ports/schema-validator.ts",
    "src/contexts/tools/domain/ports/host-plugin-registry-reader.ts",
    // What a host's own plugin registry says about a plugin AIDD installed for it — the
    // comparison `telemetry`'s diagnostic and `framework`'s `doctor` both need.
    "src/contexts/tools/domain/host-plugin-registration.ts",
    // what a tool declares about plugins, read by whoever installs one for it — the
    // context has no application layer of its own since installing is framework work
    "src/contexts/tools/domain/capabilities/plugins-capability.ts",
    "src/contexts/tools/domain/marketplace-settings.ts",
    "src/contexts/tools/domain/plugin-translation-mode.ts",
    "src/contexts/tools/domain/hooks-format.ts",
    "src/contexts/tools/domain/models/plugin-install-notice.ts",
    // The shape of the file a tool's hooks land in, read by whoever writes one for it —
    // the installer that merges a plugin's hooks in, and the diagnostic that reads them
    // back out to answer whether the tool will actually run them.
    "src/contexts/tools/domain/formats/flat-hooks-merge.ts",
    "src/contexts/tools/domain/formats/cursor-hooks-project-merge.ts",
    // The variable each tool expands to an installed plugin's own directory. A tool
    // declares which one it speaks; translate substitutes it, and the diagnostic looks for
    // it in what was installed — three readers of one vocabulary, none of them a twin.
    "src/contexts/tools/domain/formats/plugin-root-token.ts",
  ],
  // Telemetry answers questions and something has to ask them: every entry here is reached
  // by `presentation` (which renders an answer) or by the composition root (which wires an
  // adapter into a port). Nothing here is an adapter, and no other context appears — what
  // telemetry needs from elsewhere it declares as its own ports
  // (`domain/ports/installed-plugins-reader.ts`, `ignore-entries.ts`), satisfied at the
  // composition root, so measurement reaches into no context and no context reaches into it.
  telemetry: [
    // the six use cases the `telemetry` command drives
    "src/contexts/telemetry/application/telemetry-on-use-case.ts",
    "src/contexts/telemetry/application/telemetry-off-use-case.ts",
    "src/contexts/telemetry/application/read-local-cost-use-case.ts",
    "src/contexts/telemetry/application/report-cost-use-case.ts",
    "src/contexts/telemetry/application/diagnose-telemetry-use-case.ts",
    "src/contexts/telemetry/application/forget-telemetry-use-case.ts",
    "src/contexts/telemetry/application/person-identity-use-case.ts",
    // the shapes a rendered answer is made of
    "src/contexts/telemetry/domain/cost-report.ts",
    "src/contexts/telemetry/domain/cost-report-envelope.ts",
    // How a person id was resolved, which the artefact prints beside each row.
    "src/contexts/telemetry/domain/person-resolution.ts",
    "src/contexts/telemetry/domain/report-period.ts",
    "src/contexts/telemetry/domain/telemetry-removal.ts",
    "src/contexts/telemetry/domain/telemetry-claim.ts",
    "src/contexts/telemetry/domain/telemetry-setup.ts",
    "src/contexts/telemetry/domain/telemetry-export-leftover.ts",
    "src/contexts/telemetry/domain/flow-attribution.ts",
    "src/contexts/telemetry/domain/step-attribution.ts",
    "src/contexts/telemetry/domain/task-attribution.ts",
    // the trailer a commit carries, written by the git adapter that installs the hook
    "src/contexts/telemetry/domain/formats/commit-session-trailer.ts",
    // ports a caller wires a concrete adapter into
    "src/contexts/telemetry/domain/ports/telemetry-sink.ts",
    "src/contexts/telemetry/domain/ports/version-control.ts",
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
    // Four `contexts/tools/...` paths used to sit here, duplicating `tools`' own entries.
    // They were never consulted: the lookup is keyed by the *imported* file's context, so a
    // `tools` file is only ever checked against `tools`. A per-consumer allowance is not
    // something this mechanism can express, and those modules are public to everyone anyway.
  ],
  // Measured with the composition root excluded: ten modules are reached from outside,
  // and not one of them is an adapter. The adapters are wired by `runtime/wiring/framework.ts` alone, which
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
  // The largest context, and the last to be fenced — this file's own header said the list
  // would grow "as `framework` and `distribution` are extracted", and only `distribution`
  // ever was. Until this entry existed the mechanism below skipped every framework file, so
  // fifteen imports reached its interior unchecked. Measured, composition root excluded.
  framework: [
    // The rule inventory `framework rules` prints, one row per installed rule.
    "src/contexts/framework/domain/installed-rule.ts",
    // the installation record, which is what this context owns
    "src/contexts/framework/domain/manifest.ts",
    "src/contexts/framework/domain/ports/manifest-repository.ts",
    "src/contexts/framework/domain/install-scope.ts",
    "src/contexts/framework/domain/project-context.ts",
    // the flows a command drives end to end
    "src/contexts/framework/application/setup-use-case.ts",
    "src/contexts/framework/application/setup/setup-tools-use-case.ts",
    "src/contexts/framework/application/plugin/plugin-add-use-case.ts",
    "src/contexts/framework/application/plugin/plugin-install-from-marketplace-use-case.ts",
    // what a display or a prompt reads to render a decision it does not make
    "src/contexts/framework/domain/doctor.ts",
    "src/contexts/framework/domain/setup-flow.ts",
    "src/contexts/framework/domain/tool-recommendations.ts",
    // the one operation another context genuinely asks for: `distribution` removes a
    // marketplace and this context forgets the plugins that came from it
    "src/contexts/framework/application/flows/marketplace-remove-use-case.ts",
  ],
};

/** Every directory under `src/contexts/`, which is what a context is. */
function contextsOnDisk(files: readonly string[]): string[] {
  const names = new Set<string>();
  for (const file of files) {
    const match = /^src\/contexts\/([^/]+)\//.exec(file);
    if (match) names.add(match[1] as string);
  }
  return [...names].sort();
}

/** The context a file belongs to, or `null` when it is not inside any context yet. */
function contextOf(file: string): string | null {
  const match = /^src\/contexts\/([^/]+)\//.exec(file);
  return match ? match[1] : null;
}

/**
 * The composition root wires every context by construction: profiles register
 * themselves through a side-effect import, and a concrete adapter must be named to be
 * instantiated. Exempting it mirrors `earned-sharing.arch.test.ts`'s exemption of the
 * same directory for the same reason — it is not a caller this rule is trying to catch.
 * Phase 16 split the single `runtime/wiring/framework.ts` into one wiring module per
 * context under `runtime/wiring/`, so the exemption follows the whole directory.
 */
function isCompositionRoot(file: string): boolean {
  return file.startsWith("src/runtime/wiring/");
}

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
      if (isCompositionRoot(importer)) continue;
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
  "src/contexts/framework/application/install/content/install-agents-use-case.ts -> src/contexts/tools/domain/capabilities/agents-capability.ts",
  "src/contexts/framework/application/install/content/install-commands-use-case.ts -> src/contexts/tools/domain/capabilities/commands-capability.ts",
  "src/contexts/framework/application/install/content/install-content-section-use-case.ts -> src/contexts/tools/domain/formats/command.ts",
  "src/contexts/framework/application/install/content/install-rules-use-case.ts -> src/contexts/tools/domain/capabilities/rules-capability.ts",
  "src/contexts/framework/application/install/content/install-skills-use-case.ts -> src/contexts/tools/domain/capabilities/skills-capability.ts",
];

describe("nothing imports a context's interior", () => {
  it("every cross-context import targets a declared public module", () => {
    const violations = reachesIntoInterior(sourceFiles(), importersByFile(), PUBLIC_MODULES);

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "new import reaches a context's undeclared interior").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("declares a public surface for every context on disk", () => {
    const declared = Object.keys(PUBLIC_MODULES).sort();

    expect(
      contextsOnDisk(sourceFiles()),
      "a context with no entry above is skipped entirely by the rule, not held by it"
    ).toEqual(declared);
  });

  it("skips a context silently when it has no declaration, which is why the check above exists", () => {
    const files = ["src/contexts/ghost/domain/inner.ts"];
    const importers = new Map([
      ["src/contexts/ghost/domain/inner.ts", new Set(["src/presentation/commands/x.ts"])],
    ]);

    expect(
      reachesIntoInterior(files, importers, {}),
      "undeclared means unchecked — the failure mode this rule had for framework"
    ).toEqual([]);
    expect(
      reachesIntoInterior(files, importers, { ghost: [] }),
      "declared with an empty surface means every reach is a violation"
    ).toEqual(["src/presentation/commands/x.ts -> src/contexts/ghost/domain/inner.ts"]);
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
        new Set(["src/contexts/acme/application/sibling.ts", "src/runtime/wiring/framework.ts"]),
      ],
    ]);
    const publicModules = { acme: [] };

    expect(reachesIntoInterior(files, importers, publicModules)).toEqual([]);
  });
});

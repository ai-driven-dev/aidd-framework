/**
 * A codebase that forbids barrels cannot hold a context's boundary with a re-export file, so
 * it holds it here: an import from outside a context may only target a module listed below.
 * The list is the fence, not a description of what happens to be used.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, importersByFile, sourceFiles } from "./helpers.js";

/** Each context's declared public surface, one entry per context. */
const PUBLIC_MODULES: Readonly<Record<string, readonly string[]>> = {
  tools: [
    // the tool contract and lookup surface
    "src/contexts/tools/domain/contracts.ts",
    "src/contexts/tools/domain/registry.ts",
    "src/contexts/tools/domain/build-contract.ts",
    // co-owned configuration (settings.json, .mcp.json et al.)
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
    // What a host's registry says about an installed plugin: telemetry's diagnostic and
    // `doctor` both need the comparison.
    "src/contexts/tools/domain/host-plugin-registration.ts",
    "src/contexts/tools/domain/ports/host-marketplace-registry-reader.ts",
    // Whether a name a host's registry holds points at a different source: the sync-time
    // guard and `doctor`'s conflict check share the comparison.
    "src/contexts/tools/domain/marketplace-source-conflict.ts",
    // what a tool declares about plugins: this context has no application layer, since
    // installing is framework work
    "src/contexts/tools/domain/capabilities/plugins-capability.ts",
    "src/contexts/tools/domain/marketplace-settings.ts",
    "src/contexts/tools/domain/plugin-translation-mode.ts",
    "src/contexts/tools/domain/hooks-format.ts",
    "src/contexts/tools/domain/models/plugin-install-notice.ts",
    // The shape of the file a tool's hooks land in, read by the installer that merges them
    // and the diagnostic that answers whether the tool will run them.
    "src/contexts/tools/domain/formats/flat-hooks-merge.ts",
    "src/contexts/tools/domain/formats/cursor-hooks-project-merge.ts",
    // The variable each tool expands to an installed plugin's directory: a tool declares it,
    // translate substitutes it, the diagnostic looks for it in what was installed.
    "src/contexts/tools/domain/formats/plugin-root-token.ts",
  ],
  // Every entry is reached by `presentation` or by the composition root, and none is an
  // adapter: what telemetry needs elsewhere it declares as its own port instead, so
  // measurement reaches into no context and no context reaches into it.
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
    // how a person id was resolved, printed beside each row
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
    // A per-consumer allowance is not expressible here: the lookup is keyed by the imported
    // file's own context, so a `tools` file is only ever checked against `tools`.
  ],
  // Measured with the composition root excluded, and not one entry is an adapter: the
  // adapters are wired from `runtime/wiring/` alone, so they stay internal.
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
  // The largest context: while it had no entry the mechanism below skipped every framework
  // file, so its interior was reached unchecked. Measured, composition root excluded.
  framework: [
    // the rule inventory `framework rules` prints, one row per installed rule
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

function contextsOnDisk(files: readonly string[]): string[] {
  const names = new Set<string>();
  for (const file of files) {
    const match = /^src\/contexts\/([^/]+)\//.exec(file);
    if (match) names.add(match[1] as string);
  }
  return [...names].sort();
}

function contextOf(file: string): string | null {
  const match = /^src\/contexts\/([^/]+)\//.exec(file);
  return match ? match[1] : null;
}

/**
 * The composition root wires every context by construction — a profile registers itself
 * through a side-effect import, an adapter must be named to be instantiated — so the whole
 * `runtime/wiring/` directory is exempt rather than a caller this rule tries to catch.
 */
function isCompositionRoot(file: string): boolean {
  return file.startsWith("src/runtime/wiring/");
}

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
 * Reaches into a context's interior today; the list may only shrink. Each entry is an
 * `install-*-use-case.ts` reaching past `tools`' declared contract for the capability class
 * itself, and they resolve together when `install/` moves into `contexts/tools/application/`.
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
});

describe("the guard itself", () => {
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

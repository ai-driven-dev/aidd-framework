import { defineConfig } from "tsup";

// The two scripts the plugin ships, each inside the skill that owns it, with every
// dependency inlined so installing the plugin is the whole installation.
//
// **CommonJS, and `.js`**, matching the hooks beside them: the plugin directory carries no
// `package.json`, so node reads a `.js` there as CommonJS — one module system across every
// executable file a plugin ships, rather than two spellings to remember.
//
// Not a top-level directory: a plugin is installed by translating its files into each
// tool's own layout, and that translation carries `skills/`, `agents/`, `commands/`,
// `rules/` and `hooks/` and drops everything else. A script anywhere else is silently
// never installed. See `domain/models/plugin-content-translator.ts`.
//
// Committed, because a plugin is copied into a project and cannot run a build step of its
// own. `tests/e2e/telemetry-plugin-standalone.e2e.test.ts` fails when what is committed no
// longer matches this source.
const SKILLS = "../plugins/aidd-telemetry/skills";

export default defineConfig([
  pluginScript("telemetry-switch", `${SKILLS}/00-init/scripts`),
  pluginScript("telemetry-report", `${SKILLS}/01-cost/scripts`),
]);

function pluginScript(name: string, outDir: string) {
  return {
    entry: { [name]: `src/plugin-bin/${name}.ts` },
    format: ["cjs" as const],
    target: "node20",
    // Redirected by the drift check, which builds into a temporary directory and compares
    // the result against what is committed.
    outDir: process.env.AIDD_PLUGIN_BIN_OUT_DIR ?? outDir,
    // Never `clean`: these write into directories the plugin owns, beside files this build
    // did not produce.
    clean: false,
    sourcemap: false,
    dts: false,
    splitting: false,
    shims: false,
    // tsup names a CommonJS output `.cjs` by default; the plugin directory has no
    // `package.json`, so `.js` there is already CommonJS and matches the hooks beside it.
    outExtension: () => ({ js: ".js" }),
    skipNodeModulesBundle: false,
    noExternal: [/.*/],
    esbuildOptions(options: { minifySyntax?: boolean; minifyWhitespace?: boolean }) {
      options.minifySyntax = true;
      options.minifyWhitespace = true;
    },
  };
}

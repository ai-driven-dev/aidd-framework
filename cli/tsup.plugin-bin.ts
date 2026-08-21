import { defineConfig } from "tsup";

// The reporter the plugin ships, inside the skill that owns it, with every dependency
// inlined so installing the plugin is the whole installation.
//
// **Not minified.** This lands in someone else's repository, where an unreadable blob is a
// trust problem before it is an aesthetic one. Unminified it keeps real function names and
// a `// src/...` marker above every block, so a reader can see what it does and where each
// part came from. It costs 40% in size and buys an auditable file.
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

const GENERATED_HEADER = [
  "#!/usr/bin/env node",
  "// Generated from cli/src/plugin-bin/telemetry-report.ts and the domain it imports.",
  "// Do not edit here: cli/tests/e2e/telemetry-plugin-standalone.e2e.test.ts rebuilds",
  "// this file and fails when what is committed no longer matches its source.",
  "//",
  "// Bundled rather than imported because a plugin is copied into a project and cannot",
  "// run an install step, and left unminified because it lands in someone else's",
  "// repository, where an unreadable file is a reason not to trust it.",
].join("\n");

// See the note at the top: readability is the point, and this file is copied rather than
// downloaded, so its size buys nothing back.
function readable(options: { minifySyntax?: boolean; minifyWhitespace?: boolean }): void {
  options.minifySyntax = false;
  options.minifyWhitespace = false;
}

function pluginScript(name: string, outDir: string) {
  return {
    entry: { [name]: `src/plugin-bin/${name}.ts` },
    banner: { js: GENERATED_HEADER },
    format: ["cjs" as const],
    target: "node20",
    // Redirected by the drift check, which builds into a temporary directory and compares
    // the result against what is committed.
    outDir: process.env.AIDD_PLUGIN_BIN_OUT_DIR ?? outDir,
    // Never `clean`: this writes into a directory the plugin owns, beside files this build
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
    esbuildOptions: readable,
  };
}

// Only the reporter is built. `00-init/scripts/telemetry-switch.js` is hand-written plain
// CommonJS, like the hooks: it is the file someone reads before allowing anything to be
// recorded, and sixty readable lines answer that better than any artefact could.
export default defineConfig([pluginScript("telemetry-report", `${SKILLS}/01-cost/scripts`)]);

import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "tsup";

/**
 * Where the build lands. Each e2e run passes its own directory
 * (`tests/e2e/global-setup.ts`) so two concurrent vitest invocations never share, and
 * race to rewrite, one `dist/cli.js`.
 *
 * It must stay inside this package. `skipNodeModulesBundle` leaves every dependency an
 * external import that Node resolves by walking up from the built file, so a directory
 * under `cli/` finds `cli/node_modules` on its own. A directory outside — an OS temp dir
 * — finds nothing, and the binary fails on `commander` before it prints a word.
 */
const outDir = process.env.AIDD_BUILD_OUT_DIR ?? "dist";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  target: "node20",
  outDir,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  sourcemap: false,
  dts: false,
  // Kept on so a dynamic import stays dynamic. Kanban's two views defer their text
  // interface — ink, react, cli-table3 — to the moment the command runs; with splitting
  // off esbuild folds those imports back into static ones and the deferral is lost in
  // silence, putting a megabyte and a half back on every invocation.
  splitting: true,
  shims: false,
  skipNodeModulesBundle: true,
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      ".md": "text",
      ".toml": "text",
    };
    options.minifySyntax = true;
    options.minifyWhitespace = true;
  },
  async onSuccess() {
    copyFileSync(
      "assets/schemas/claude-code-plugin-manifest.json",
      join(outDir, "claude-code-plugin-manifest.json")
    );
    copyFileSync(
      "assets/schemas/copilot-plugin-marketplace.json",
      join(outDir, "copilot-plugin-marketplace.json")
    );
    copyFileSync(
      "assets/schemas/claude-marketplace-manifest.json",
      join(outDir, "claude-marketplace-manifest.json")
    );
    copyFileSync(
      "assets/schemas/codex-plugin-manifest.json",
      join(outDir, "codex-plugin-manifest.json")
    );
    copyFileSync(
      "assets/schemas/codex-marketplace-manifest.json",
      join(outDir, "codex-marketplace-manifest.json")
    );
  },
});

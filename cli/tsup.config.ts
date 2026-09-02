import { copyFileSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  target: "node20",
  outDir: "dist",
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
      "dist/claude-code-plugin-manifest.json"
    );
    copyFileSync(
      "assets/schemas/copilot-plugin-marketplace.json",
      "dist/copilot-plugin-marketplace.json"
    );
    copyFileSync(
      "assets/schemas/claude-marketplace-manifest.json",
      "dist/claude-marketplace-manifest.json"
    );
    copyFileSync("assets/schemas/codex-plugin-manifest.json", "dist/codex-plugin-manifest.json");
    copyFileSync(
      "assets/schemas/codex-marketplace-manifest.json",
      "dist/codex-marketplace-manifest.json"
    );
  },
});

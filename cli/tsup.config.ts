import { copyFileSync, mkdirSync } from "node:fs";
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
  splitting: false,
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
    mkdirSync("dist/kanban-frontend", { recursive: true });
    copyFileSync(
      "../kanban/src/presentation/web/frontend/index.html",
      "dist/kanban-frontend/index.html"
    );
    copyFileSync(
      "../kanban/src/presentation/web/frontend/styles.css",
      "dist/kanban-frontend/styles.css"
    );
    copyFileSync("../kanban/src/presentation/web/frontend/app.js", "dist/kanban-frontend/app.js");
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

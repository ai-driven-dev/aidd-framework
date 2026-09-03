import { copyFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

/**
 * Where the build lands. `dist` normally; each e2e run passes its own directory under
 * `.e2e-build/` (`tests/e2e/global-setup.ts`) so two concurrent vitest invocations never
 * share, and race to rewrite, one `dist/cli.js`.
 *
 * Those two are the whole legitimate set, and anything else is refused rather than
 * trusted. `clean: true` empties the target before building, so an out dir pointed at a
 * directory holding anything else destroys its contents — silently, exiting 0. And a
 * directory outside this package could not produce a working binary anyway:
 * `skipNodeModulesBundle` leaves every dependency an external import that Node resolves
 * by walking up from the built file, so only somewhere under `cli/` finds
 * `cli/node_modules`. Refusing here turns both into an error that says so.
 */
const PACKAGE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const E2E_BUILD_ROOT = resolve(PACKAGE_ROOT, ".e2e-build");

function resolveOutDir(): string {
  const requested = process.env.AIDD_BUILD_OUT_DIR;
  if (requested === undefined) return "dist";

  const absolute = resolve(PACKAGE_ROOT, requested);
  if (absolute === resolve(PACKAGE_ROOT, "dist")) return requested;
  if (absolute.startsWith(`${E2E_BUILD_ROOT}${sep}`)) return requested;

  throw new Error(
    `AIDD_BUILD_OUT_DIR must be this package's "dist" or a directory under ".e2e-build/", ` +
      `and was "${requested}". The build empties its target before writing, and a binary ` +
      `built outside this package cannot resolve its dependencies.`
  );
}

const outDir = resolveOutDir();

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
  // Off: nothing in the bundle defers a heavy import any more. It was on for kanban's two
  // views, which loaded their text interface — ink, react, cli-table3 — only when the
  // command ran; with splitting off esbuild folds such an import back into a static one and
  // the deferral is lost in silence. That command is gone, and the build produces one file
  // either way. Turn this back on before adding a dynamic import worth deferring.
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

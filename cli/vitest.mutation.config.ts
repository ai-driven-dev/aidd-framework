import { defineConfig } from "vitest/config";
import { textLoader } from "./tests/helpers/vitest-text-loader.js";

const TEXT_EXTENSIONS = [".md", ".toml"] as const;

/**
 * The projects a mutation run may use: the two that measure behaviour.
 *
 * The architecture ratchets read the source tree as text — folder sizes, cited paths,
 * the import graph. Stryker works on a copy of that tree with a mutant injected, so those
 * tests answer a question about the sandbox rather than about the code, and they fail the
 * initial run before a single mutant is tried.
 *
 * The e2e project is left out for the opposite reason: it spawns the built binary, which
 * no mutant reaches, so every mutant would survive it and dilute the score with noise.
 *
 * A plain `test.exclude` does not do this. The workspace file defines the projects, and
 * it wins over a config passed with `--config`; only another workspace replaces it.
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [textLoader(TEXT_EXTENSIONS)],
        test: {
          name: "unit",
          include: ["tests/**/*.unit.test.ts"],
          globals: false,
          environment: "node",
        },
      },
      {
        plugins: [textLoader(TEXT_EXTENSIONS)],
        test: {
          name: "integration",
          include: ["tests/**/*.integration.test.ts"],
          globals: false,
          environment: "node",
          testTimeout: 60000,
        },
      },
    ],
  },
});

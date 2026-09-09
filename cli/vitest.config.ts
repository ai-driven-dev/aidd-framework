import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { textLoader } from "./tests/helpers/vitest-text-loader.js";

export default defineConfig({
  plugins: [textLoader([".md", ".toml"])],
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // Excluded because measuring them here would report a false zero, not because
      // they are untested. `cli.ts` and `presentation/commands/` are exercised by 104
      // e2e tests and 98 smoke checks, but both spawn a built `cli.js` as a subprocess
      // and v8 coverage does not cross a process boundary: including them reports 0%.
      // Ports are interfaces with no runtime body; `runtime/wiring/` is composition.
      // Their real net is the e2e suite and scripts/smoke-tools.sh, counted there.
      //
      // Three of these globs still named their pre-refactor locations, under the layer
      // directories the contexts replaced. They excluded nothing, so the files this comment
      // argues must not be counted were counted, and the thresholds below sat about a point
      // from failing for a reason nobody intended. `referenced-paths.arch.test.ts` now reads
      // this file, so a glob cannot outlive the directory it points at again.
      exclude: [
        "src/cli.ts",
        "src/presentation/commands/**",
        "src/kernel/ports/**",
        "src/contexts/*/domain/ports/**",
        "src/runtime/wiring/**",
      ],
      // Measured 93.76 / 89.31 / 94.49 / 93.76 once the stale globs above were repointed.
      // Set a little under that: a threshold with no headroom fails on an honest change,
      // and one far below what is measured is not a gate. `pnpm test:coverage` runs them,
      // and CI runs that — until this commit the numbers were configured and never executed.
      thresholds: {
        statements: 92,
        branches: 87,
        functions: 93,
        lines: 92,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
});

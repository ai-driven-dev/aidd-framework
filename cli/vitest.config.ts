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
      // they are untested. `cli.ts` and `commands/` are exercised by 126 e2e tests
      // and 98 smoke checks, but both spawn `dist/cli.js` as a subprocess and v8
      // coverage does not cross a process boundary: including them reports 0% and
      // 0.69%. Ports are interfaces with no runtime body; deps.ts is wiring.
      // Their real net is the e2e suite and scripts/smoke-tools.sh, counted there.
      exclude: [
        "src/cli.ts",
        "src/application/commands/**",
        "src/domain/ports/**",
        "src/infrastructure/deps.ts",
      ],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 90,
        lines: 85,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
});

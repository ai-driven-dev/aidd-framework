import { defineWorkspace } from "vitest/config";
import { textLoader } from "./tests/helpers/vitest-text-loader.js";

const TEXT_EXTENSIONS = [".md", ".toml"] as const;

export default defineWorkspace([
  {
    plugins: [textLoader(TEXT_EXTENSIONS)],
    test: {
      name: "unit",
      include: ["tests/**/*.unit.test.ts"],
      globals: false,
      environment: "node",
      globalSetup: ["./tests/helpers/sweep-stale-temp-dirs.ts"],
    },
  },
  {
    plugins: [textLoader(TEXT_EXTENSIONS)],
    test: {
      name: "architecture",
      include: ["tests/architecture/**/*.arch.test.ts"],
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
      globalSetup: ["./tests/helpers/sweep-stale-temp-dirs.ts"],
    },
  },
  {
    plugins: [textLoader(TEXT_EXTENSIONS)],
    test: {
      name: "e2e",
      include: ["tests/**/*.e2e.test.ts"],
      globals: false,
      environment: "node",
      testTimeout: 60000,
      globalSetup: ["./tests/e2e/global-setup.ts", "./tests/helpers/sweep-stale-temp-dirs.ts"],
    },
  },
]);

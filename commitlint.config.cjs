module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Type validated by config-conventional (feat, fix, chore, docs, refactor, perf, test, build, ci, revert, style).
    // Scope is optional. When provided, must be kebab-case. Known scopes below are encouraged but not required
    // (the rule level is `warning` = 1, so a non-listed scope is reported but does NOT block the commit).
    "scope-case": [2, "always", "kebab-case"],
    "scope-enum": [
      1,
      "always",
      [
        // Plugin scopes (long + short forms)
        "aidd-context",
        "aidd-dev",
        "aidd-vcs",
        "aidd-pm",
        "aidd-refine",
        "aidd-orchestrator",
        "aidd-ui",
        "context",
        "dev",
        "vcs",
        "pm",
        "refine",
        "orchestrator",
        "ui",
        "aidd-telemetry",
        "telemetry",
        // CLI scope
        "cli",
        "kanban",
        // Root scopes (touching marketplace.json or framework-wide config)
        "framework",
        "marketplace",
        // Tooling & infra scopes
        "release-please",
        "release",
        "ci",
        "deps",
        "deps-dev",
        "lefthook",
        "commitlint",
        "contributing",
        "docs",
        "readme",
        "security",
        "test",
      ],
    ],
    "body-max-line-length": [0, "always"],
    "footer-max-line-length": [0, "always"],
  },
};

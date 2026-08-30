import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The kanban source is mounted, not a package: cli/src may reach it only through
// its public entrypoint, kanban/src/index.ts. Any deeper import (composition,
// application, infrastructure, domain, presentation) breaks the boundary.
const ALLOWED_ENTRYPOINT = "kanban/src/index";
const cliRoot = fileURLToPath(new URL("..", import.meta.url));

const result = spawnSync("grep", ["-rn", "kanban/src/", "src"], {
  cwd: cliRoot,
  encoding: "utf8",
});

const violations = result.stdout
  .split("\n")
  .filter((line) => line !== "" && !line.includes(ALLOWED_ENTRYPOINT));

if (violations.length > 0) {
  console.error(
    "kanban boundary violation: cli/src may import kanban only through kanban/src/index.js"
  );
  for (const line of violations) {
    console.error(`  ${line}`);
  }
  process.exit(1);
}

console.log("kanban boundary ok: cli/src imports kanban only through index.js");

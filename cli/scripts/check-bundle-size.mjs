import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
// The budget makes growth visible rather than walling it off: a raise is deliberate, is
// what a reviewer sees, and leaves ~2 % headroom over what was measured, never more.
// The registry of every raise, budget then measurement then what landed:
// 560 KB: 500.8 KB, measurement across five tools.
// 590 KB: 567.7 KB, one person resolved across tools and machines.
// 593 KB: 590.6 KB, the `by_prompt` breakdown.
// 596 KB: 593.8 KB, `by_agent` telling a main thread from a tool that names no agent.
// 598 KB: 595.8 KB, the journal reader on a journal's stated schema, plus the refusal reason.
// 601 KB: 599.0 KB, `aidd ai rules` taking over the rule inventory.
// 557 KB: 545.7 KB, a reset measured against a stale lockfile, remeasured after the merge.
// 567 KB: 555.7 KB, the four telemetry axes and `framework rules`.
// 578 KB: 566.8 KB, OpenCode's hooks bridge.
// 595 KB: 584.55 KB, the marketplace source-conflict guard.
// 610 KB: 597.95 KB, the machine-scope migration and the rollback refusal.
// 625 KB: 612.56 KB, `--scope user` on `setup`, `doctor` and `sync`.
// 641 KB: 628.26 KB, `clean --scope user` and sync's migration of a pre-shared-source project.
// 654 KB: 641.0 KB, the shared-plugin, narrowing, hook and Windows-lookup passes.
const budgetKB = pkg.bundleBudgetKB ?? 500;
const budgetBytes = budgetKB * 1024;

const { size } = statSync(resolve(root, "dist/cli.js"));
const sizeKB = (size / 1024).toFixed(1);

console.log(`Bundle size: ${sizeKB} KB / budget: ${budgetKB} KB`);

if (size > budgetBytes) {
  console.error(`FAIL: bundle exceeds budget (${sizeKB} KB > ${budgetKB} KB)`);
  process.exit(1);
}

console.log("OK: within budget");

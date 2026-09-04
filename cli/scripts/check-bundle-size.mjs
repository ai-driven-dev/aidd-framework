import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
// The budget exists to make growth visible, not to be a wall: it is raised
// deliberately when a feature earns it, and the raise is what a reviewer sees.
// 560 was set when measurement across five tools took the bundle to 500.8 KB.
// 590 was set when resolving one person across tools and machines (#661) took
// the bundle to 567.7 KB - tighter headroom than the 560 raise left, on
// purpose, rather than padding past what was actually measured.
// 593 was set when `by_prompt` joined the breakdowns: measured 588.4 -> 590.6 KB,
// +2.2 KB for the axis that is complete by construction. Same tight headroom.
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

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
// +2.2 KB for the axis no host limit can empty. Same tight headroom.
// 596 was set when `by_agent` learned to tell a main thread from a tool that never
// names an agent: measured 592.0 -> 593.8 KB across two changes, the flow axis's own
// tool-stated row included. Same 2.2 KB headroom the raise before it left.
// 598 was set when the journal reader began reading the schema a journal states it was
// written under, and the diagnostic gained the reason for refusing one: measured
// 594.3 -> 595.8 KB. Same 2.2 KB headroom as the two raises before it.
// 601 was set when `aidd ai rules` took over the rule inventory the explore skill used to
// run as its own script: measured 596.6 -> 599.0 KB, +2.4 KB for a use case, a model, a
// display and the subcommand. It deletes 198 lines from a plugin, which the bundle does
// not carry either way - the trade is a plugin script that had drifted for bytes that are
// measured. Same 2.2 KB headroom as the three raises before it.
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

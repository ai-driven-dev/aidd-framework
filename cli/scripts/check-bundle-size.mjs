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
// The reset to 557 on 2026-09-04 measured 545.7 KB against a lockfile the refactor had
// left stale; the three raises above landed on next in the same two days. Remeasured after
// the merge, budget = measured + ~2 %, see the line below.
// 567 was set 2026-09-06 after merging next through #786: measured 555.7 KB, the four
// telemetry axes and `framework rules` included. Same ~2 % headroom.
// #787, the registry guard next raised its own line 601 -> 603 for, lands here at
// 556.2 KB: inside the headroom, no raise.
// 578 was set 2026-09-06 when OpenCode's hooks bridge landed: measured 566.8 KB, +7.3 KB
// for the template of the module it generates per plugin. Same ~2 % headroom.
// 595 was set 2026-09-07 when the marketplace source-conflict guard landed, replacing an
// earlier compare by resolved path alone that would have refused two projects sharing one
// build. Measured with a control build of the same tree at HEAD, the 18 files this guard
// touches reverted to their pre-guard content: 577.18 KB without it, 584.55 KB with it, a
// +7.4 KB delta — checked for an accidental heavy import first (none: every new file reads
// `node:fs/promises` and `node:path` only), so the delta is what it looks like, the two
// new readers, the pure comparison, the sync-time and doctor-time checks it now shares
// through `read-marketplace-catalog-identity.ts`, the kernel error, and the extracted
// `sync-native-activation.ts` three more command call sites now share. A same-day
// correction then narrowed what "conflict" means further, to a catalog's declared name
// plus its plugin set — never its version, so a same-name, same-plugins upgrade no longer
// refuses every second sync. 595 leaves ~1.8 % headroom over the 584.55 KB this guard
// landed at — tighter than the usual ~2 %, on purpose, rather than padding past what was
// actually measured; 577.18 KB is the baseline the next raise measures against.
// 610 was set 2026-09-07 when the machine-scope migration completed and the rollback
// refusal landed: `MarketplaceRegisterFrameworkUseCase` retiring a pre-existing
// project-scope entry, `marketplaceSourceDrift` moved to `contexts/framework/domain` and
// wired into both the read side (`doctor`) and the write side (`sync`'s own
// `registerMarketplace`, which now refuses to repoint a host backward rather than only
// reporting it after the fact), `marketplace remove`'s reserved-name guard, and the
// `realpath` normalisation the drift comparison needed on every path it takes. Measured
// 597.95 KB, no control build isolating this lot's own delta from what 595 already
// carried (a `git worktree` for that one number was judged not worth the added git state
// against the no-stash rule this pass runs under). 610 leaves ~2.0 % headroom over the
// measured 597.95 KB.
// 625 was set 2026-09-07 when `--scope user` landed on `setup`, `doctor` and `sync`: a
// user-scope manifest repository, the per-tool scope threaded through native plugin
// enable/uninstall, and the three commands' own `--scope` option and branch. Measured
// 612.56 KB — this raise covers two lots' own delta together, not one: 610 was set at
// `ed3963fe`, before the machine-scope-migration commit (`073863be`) 610's own entry
// describes ever landed, so the 610 -> 625 gap is the sum of that lot's 597.95 KB and
// this one's 612.56 KB, never this lot's own delta in isolation. No control build
// separates the two, for the same reason 610's own entry gives; a future raise from
// 625 is the number to measure a next lot's own delta against. 625 leaves ~2.0 %
// headroom over the measured 612.56 KB.
// 641 was set 2026-09-07 with two lots landing together in the same worktree: `clean
// --scope user` (the machine-scope purge, its whitelist and confirmation) and `sync`
// migrating a project installed before the shared source existed (the foreign-project
// drift kind, codex/copilot's own reclaim of the reserved name, and the stale-cache
// purge). Measured 628.26 KB — same reasoning as 610 and 625 before it: no control
// build isolates either lot's own delta from the other's, since both changed in the
// same working tree at once; a future raise from 641 is the number to measure the next
// lot's own delta against. 641 leaves ~2.0 % headroom over the measured 628.26 KB.
// 654 was set 2026-09-09 after the review and Windows passes over the same branch: the
// shared plugin left enabled where another project still needs it, plugin remove and
// marketplace add narrowing, the lefthook/husky-aware telemetry hook, the code-scanning
// answers, and the Windows executable lookup (PATHEXT, `.cmd` through the interpreter)
// and POSIX-relative manifest paths. Measured 641.0 KB, exactly the old budget, so the
// next byte would have failed CI for a reason no lot owns. 654 leaves ~2.0 % headroom
// over the measured 641.0 KB.
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

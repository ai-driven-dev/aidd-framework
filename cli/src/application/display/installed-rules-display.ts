import type { InstalledRule } from "../../domain/models/installed-rule.js";
import type { CLIOutput } from "../output.js";

/** The machine-readable form, and the contract the explore skill reads: the same array the
 * `list-rules.mjs` this replaced printed, field for field, so a skill consuming it did not
 * change when the implementation moved. Two spaces, and a trailing newline, for the same
 * reason — a diff of the two outputs is the evidence that the move changed nothing. */
export function printInstalledRulesJson(output: CLIOutput, rules: readonly InstalledRule[]): void {
  output.print(JSON.stringify(rules, null, 2));
}

/** One line per rule, the tool first. A project with no rule at all says so rather than
 * printing nothing: an empty answer and a command that did not run look identical on a
 * terminal, and only one of them is a fact about the project. */
export function printInstalledRules(output: CLIOutput, rules: readonly InstalledRule[]): void {
  if (rules.length === 0) {
    output.info("No rules installed for any AI tool.");
    return;
  }
  for (const rule of rules) {
    const scope = rule.paths === undefined ? "every file" : rule.paths.join(", ");
    output.print(`${rule.tool}  ${rule.path}`);
    output.print(`  ${rule.description === "" ? "(no description)" : rule.description}`);
    output.print(`  applies to: ${scope}`);
  }
}

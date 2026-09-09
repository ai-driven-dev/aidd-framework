import type { InstalledRule } from "../../contexts/framework/domain/installed-rule.js";
import type { CLIOutput } from "../output.js";

/** The contract the explore skill reads, field for field; the two-space indent and the
 * trailing newline are part of it. */
export function printInstalledRulesJson(output: CLIOutput, rules: readonly InstalledRule[]): void {
  output.print(JSON.stringify(rules, null, 2));
}

/** A project with no rule says so rather than printing nothing: on a terminal an empty
 * answer and a command that never ran look identical. */
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

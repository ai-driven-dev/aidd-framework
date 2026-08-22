import type { CLIOutput } from "../output.js";
import type { ToolInstallResult } from "../use-cases/setup/setup-tools-use-case.js";

export function displayInstall(
  output: CLIOutput,
  results: readonly ToolInstallResult[],
  verbose: boolean
): void {
  const skipped = results.filter((r) => r.skipped);
  const installed = results.filter((r) => !r.skipped);
  for (const r of skipped) output.warn(`${r.toolId} is already installed.`);
  for (const r of installed) for (const w of r.warnings) output.warn(w);
  if (verbose) {
    for (const r of installed) {
      output.debug(`Tool: ${r.toolId}`);
      for (const f of r.files) output.debug(`  + ${f.relativePath}`);
    }
  }
  if (installed.length === 1) {
    output.success(`Installed ${installed[0].toolId} (${installed[0].fileCount} files)`);
  } else if (installed.length > 1) {
    const total = installed.reduce((s, r) => s + r.fileCount, 0);
    output.success(`Installed ${installed.map((r) => r.toolId).join(", ")} (${total} files)`);
  }
}

export function printWelcomeBanner(output: CLIOutput): void {
  output.print("");
  output.print("AI-Driven Development setup");
  output.print("Wires your AI tools, registers the framework marketplace, installs plugins.");
  output.print("Press Ctrl-C any time to abort.");
  output.print("");
}

export function printNextSteps(output: CLIOutput, installedAnything: boolean): void {
  output.print("");
  output.print("Next steps:");
  if (installedAnything) output.print("  aidd ai status          # verify drift");
  output.print("  aidd marketplace list   # see registered marketplaces");
  output.print("  aidd plugin install     # add plugins");
  output.print("  aidd --help             # explore commands");
}

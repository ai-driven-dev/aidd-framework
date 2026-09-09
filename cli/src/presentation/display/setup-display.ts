import type { CLIOutput } from "../output.js";

interface ToolInstallOutcome {
  readonly toolId: string;
  readonly fileCount: number;
  readonly files: readonly { readonly relativePath: string }[];
  readonly skipped: boolean;
  readonly warnings: readonly string[];
}

interface SetupOutcome {
  readonly kind: "initialized" | "up-to-date";
  readonly install: { readonly results: readonly ToolInstallOutcome[] };
}

function displayInstall(
  output: CLIOutput,
  results: readonly ToolInstallOutcome[],
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

export function printSetupOutcome(output: CLIOutput, result: SetupOutcome, verbose: boolean): void {
  switch (result.kind) {
    case "initialized": {
      output.success("Project initialized.");
      displayInstall(output, result.install.results, verbose);
      break;
    }
    case "up-to-date": {
      output.info("Project is up to date.");
      displayInstall(output, result.install.results, verbose);
      break;
    }
  }
}

export function printDetectedContext(output: CLIOutput, description: string): void {
  output.info(`Detected: ${description}.`);
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
  if (installedAnything) output.print("  aidd doctor             # verify drift");
  output.print("  aidd marketplace list   # see registered marketplaces");
  output.print("  aidd plugin install     # add plugins");
  output.print("  aidd --help             # explore commands");
}

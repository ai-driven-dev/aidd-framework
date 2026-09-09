import type { FrameworkBuildMode } from "../../contexts/tools/domain/registry.js";
import type { CLIOutput } from "../output.js";

interface TranslateOutcome {
  readonly pluginCount: number;
  readonly totalFiles: number;
  readonly outDir: string;
}

export function printTranslateResult(
  output: CLIOutput,
  mode: FrameworkBuildMode,
  outcome: TranslateOutcome
): void {
  if (mode === "flat") {
    output.success(
      `Flat-installed ${outcome.pluginCount} plugins, ${outcome.totalFiles} files written under ${outcome.outDir}`
    );
    return;
  }
  output.success(
    `Built ${outcome.pluginCount} plugins, ${outcome.totalFiles} files written to ${outcome.outDir}`
  );
}

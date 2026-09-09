import type { SelfUpdateResult } from "../../runtime/self-update/self-update-use-case.js";
import type { CLIOutput } from "../output.js";

export function printSelfUpdateResult(output: CLIOutput, result: SelfUpdateResult): void {
  switch (result.kind) {
    case "up-to-date":
    case "check-current":
      output.success(`Already up to date (${result.version})`);
      break;
    case "check-available":
      output.info(
        `New version available: ${result.latestVersion} (current: ${result.currentVersion})`
      );
      break;
    case "dry-run":
      output.info(`Would install @ai-driven-dev/cli@${result.latestVersion}`);
      break;
    case "updated": {
      const binaryPart = result.binaryPath ? ` (${result.binaryPath})` : "";
      output.success(`Successfully updated to version ${result.latestVersion}${binaryPart}`);
      if (result.changelog) {
        output.info(`\nChangelog:\n${result.changelog}`);
      }
      break;
    }
  }
}

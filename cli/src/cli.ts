import { platform } from "node:os";
import { Command } from "commander";
import { registerAuthCommand } from "./presentation/commands/auth.js";
import { registerCleanCommand } from "./presentation/commands/clean.js";
import { registerDoctorCommand } from "./presentation/commands/doctor.js";
import { registerFrameworkCommand } from "./presentation/commands/framework.js";
import { registerKanbanCommand } from "./presentation/commands/kanban.js";
import { registerMarketplaceCommand } from "./presentation/commands/marketplace.js";
import { runMenuLoop } from "./presentation/commands/menu.js";
import { registerPluginCommand } from "./presentation/commands/plugin.js";
import { registerSetupCommand } from "./presentation/commands/setup.js";
import { registerSyncCommand } from "./presentation/commands/sync.js";
import { registerTranslateCommand } from "./presentation/commands/translate.js";
import { registerUpdateCommand } from "./presentation/commands/update.js";
import { CLIOutput } from "./presentation/output.js";
import { CurrentVersionAdapter } from "./runtime/self-update/current-version-adapter.js";
import { createDeps } from "./runtime/wiring/framework.js";

function formatVersion(version: string): string {
  return `aidd/${version} node/${process.versions.node} ${platform()}-${process.arch}`;
}

const currentVersion = new CurrentVersionAdapter().get();

const program = new Command();

program
  .name("aidd")
  .description("Generate AI coding assistant configurations from the AIDD framework")
  .version(formatVersion(currentVersion), "-V, --version", "Show version number")
  .option("--verbose", "Show detailed diagnostic output", false);

registerSetupCommand(program);
registerFrameworkCommand(program);
registerTranslateCommand(program);
registerPluginCommand(program);
registerMarketplaceCommand(program);
registerAuthCommand(program);
registerKanbanCommand(program);
registerSyncCommand(program);
registerUpdateCommand(program);
registerDoctorCommand(program);
registerCleanCommand(program);

// Commands already paying for network I/O: piggyback the update-check refresh on them.
// Subcommand-path-granular — `marketplace remove` (offline) and `update` (which already
// resolves the latest version itself) are deliberately absent.
const ONLINE_COMMAND_PATHS = new Set([
  "marketplace refresh",
  "marketplace check",
  "marketplace list",
  "marketplace add",
]);

program.hook("preAction", async (_thisCommand, actionCommand) => {
  if (process.env.AIDD_SKIP_UPDATE_CHECK === "1") return;
  const opts = program.opts<{ verbose?: boolean }>();
  const output = new CLIOutput(opts.verbose ?? false);
  const deps = await createDeps(process.cwd(), { verbose: opts.verbose ?? false }, output).catch(
    () => null
  );
  if (!deps) return;
  // A bare verb with no subject means "the CLI itself" (Claude Code/Codex convention):
  // `update` resolves the latest version on its own, so the generic check is redundant.
  if (actionCommand.name() === "update") return;
  await deps.checkUpdateUseCase.printFromCacheOnly().catch((err: unknown) => {
    deps.logger.debug(
      `CLI update check failed: ${err instanceof Error ? err.message : String(err)}`
    );
  });
});

program.hook("postAction", async (_thisCommand, actionCommand) => {
  // The refresh asks GitHub what the latest release is and caches the answer, so any
  // run that performs it produces output depending on what has been published since.
  // A test suite that captures output cannot afford that: every release would rewrite
  // its expectations. Same switch shape as AIDD_SKIP_MARKETPLACE_REFRESH, same reason.
  if (process.env.AIDD_SKIP_UPDATE_CHECK === "1") return;
  if (!ONLINE_COMMAND_PATHS.has(resolveCommandPath(actionCommand))) return;
  const opts = program.opts<{ verbose?: boolean }>();
  const output = new CLIOutput(opts.verbose ?? false);
  const deps = await createDeps(process.cwd(), { verbose: opts.verbose ?? false }, output).catch(
    () => null
  );
  if (!deps) return;
  await deps.checkUpdateUseCase.refresh().catch((err: unknown) => {
    deps.logger.debug(
      `CLI update refresh failed: ${err instanceof Error ? err.message : String(err)}`
    );
  });
});

function resolveCommandPath(actionCommand: Command): string {
  const parts: string[] = [];
  let current: Command | null = actionCommand;
  while (current && current.name() !== "aidd") {
    parts.unshift(current.name());
    current = current.parent;
  }
  return parts.join(" ");
}

const cliArgs = process.argv.slice(2);

if (cliArgs.length === 0 && process.stdout.isTTY) {
  runMenuLoop();
} else {
  program.parse(process.argv);
}

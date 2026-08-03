import { platform } from "node:os";
import { Command } from "commander";
import { registerAiCommand } from "./application/commands/ai.js";
import { registerAuthCommand } from "./application/commands/auth.js";
import { registerCleanCommand } from "./application/commands/clean.js";
import { registerDoctorCommand } from "./application/commands/doctor.js";
import { registerFrameworkCommand } from "./application/commands/framework.js";
import { registerIdeCommand } from "./application/commands/ide.js";
import { registerKanbanCommand } from "./application/commands/kanban.js";
import { registerMarketplaceCommand } from "./application/commands/marketplace.js";
import { runMenuLoop } from "./application/commands/menu.js";
import { registerPluginCommand } from "./application/commands/plugin.js";
import { registerRestoreCommand } from "./application/commands/restore.js";
import { registerSelfUpdateCommand } from "./application/commands/self-update.js";
import { registerSetupCommand } from "./application/commands/setup.js";
import { registerStatusCommand } from "./application/commands/status.js";
import { registerUpdateCommand } from "./application/commands/update.js";
import { CLIOutput } from "./application/output.js";
import { CurrentVersionAdapter } from "./infrastructure/adapters/current-version-adapter.js";
import { createDeps } from "./infrastructure/deps.js";

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
registerAiCommand(program);
registerIdeCommand(program);
registerPluginCommand(program);
registerMarketplaceCommand(program);
registerAuthCommand(program);
registerStatusCommand(program);
registerKanbanCommand(program);
registerRestoreCommand(program);
registerUpdateCommand(program);
registerDoctorCommand(program);
registerCleanCommand(program);
registerSelfUpdateCommand(program);

// Commands already paying for network I/O: piggyback the update-check refresh on them.
// Subcommand-path-granular — `marketplace remove` (offline) and `self-update` are deliberately absent.
const ONLINE_COMMAND_PATHS = new Set([
  "update",
  "marketplace refresh",
  "marketplace check",
  "marketplace list",
  "marketplace add",
]);

program.hook("preAction", async (_thisCommand, actionCommand) => {
  const opts = program.opts<{ verbose?: boolean }>();
  const output = new CLIOutput(opts.verbose ?? false);
  const deps = await createDeps(process.cwd(), { verbose: opts.verbose ?? false }, output).catch(
    () => null
  );
  if (!deps) return;
  if (actionCommand.name() === "self-update") return;
  await deps.checkUpdateUseCase.printFromCacheOnly().catch((err: unknown) => {
    deps.logger.debug(
      `CLI update check failed: ${err instanceof Error ? err.message : String(err)}`
    );
  });
});

program.hook("postAction", async (_thisCommand, actionCommand) => {
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

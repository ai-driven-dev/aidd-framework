import type { Command } from "commander";
import type { DoctorReport } from "../../contexts/framework/domain/doctor.js";
import type { ToolCategory, ToolId } from "../../kernel/tool.js";
import { isAiToolId } from "../../kernel/tool.js";
import { createDeps } from "../../runtime/wiring/framework.js";
import { printPluginIssues, printScopeIssues } from "../display/doctor-display.js";
import { printPluginDrift, printScopeReport } from "../display/status-display.js";
import { ErrorHandler } from "../error-handler.js";
import type { CLIOutput } from "../output.js";
import { parseGlobalOptions } from "./global-options.js";

type Deps = Awaited<ReturnType<typeof createDeps>>;

function categoryOf(toolId: ToolId): ToolCategory {
  return isAiToolId(toolId) ? "ai" : "ide";
}

/**
 * The tool inventory `doctor` gains in phase 18: which tools are equipped (present in
 * the manifest, with how much they carry), independent of whether they are healthy or
 * drifted — those are reported separately below. Versions come from the status report
 * (already fetched for drift) rather than a second manifest read.
 */
function printInventory(
  output: CLIOutput,
  label: string,
  doctorReport: DoctorReport | null,
  statusTools: readonly { toolId: string; version: string }[]
): void {
  const health = doctorReport?.toolHealth ?? [];
  if (health.length === 0) return;
  output.print(`\n${label} tools:`);
  for (const h of health) {
    const version = statusTools.find((t) => t.toolId === h.toolId)?.version ?? "unknown";
    output.print(
      `  ${h.toolId} (v${version}): ${h.fileCount} files, ${h.mergeFileCount} merge files`
    );
  }
}

async function runFullDoctor(
  deps: Deps,
  output: CLIOutput,
  projectRoot: string,
  pluginName: string | undefined
): Promise<void> {
  const doctorResult = await deps.doctorAllUseCase.execute(projectRoot, pluginName);
  const statusResult = await deps.statusAllUseCase.execute(projectRoot);
  for (const e of doctorResult.errors) output.warn(`[${e.scope}] ${e.message}`);

  printInventory(output, "AI", doctorResult.ai, statusResult.aiTools.tools);
  printInventory(output, "IDE", doctorResult.ide, statusResult.ideTools.tools);

  output.print("\nDrift:");
  output.print("AI tools:");
  printScopeReport(output, statusResult.aiTools);
  output.print("IDE tools:");
  printScopeReport(output, statusResult.ideTools);
  output.print("Plugins:");
  printPluginDrift(output, { pluginDrift: statusResult.pluginDrift });

  // Drift is informational here, same as the `status` it absorbs: it never gates the
  // exit code. Only structural health issues (below) do — unchanged from before this
  // command absorbed status, which is what keeps `status` and `doctor` effect-equivalent
  // on a project that is drifted but otherwise healthy.
  //
  // `--plugin` narrows the gate to that plugin's own issues, same as `plugin doctor`
  // did: unrelated tracked-file/reference/layout warnings elsewhere in the project must
  // not flip the exit code while this view only ever prints plugin issues for them —
  // that mismatch was exactly the silent-exit-1 regression `plugin doctor` was scoped
  // to prevent, and `doctor --plugin` inherits the same contract.
  const healthy =
    pluginName !== undefined ? doctorResult.pluginIssues.length === 0 : doctorResult.healthy;
  if (healthy) {
    output.success("\nInstallation is healthy");
    return;
  }

  if (pluginName === undefined) {
    printScopeIssues(output, "AI", doctorResult.ai);
    printScopeIssues(output, "IDE", doctorResult.ide);
  }
  printPluginIssues(output, doctorResult.pluginIssues);
  process.exit(1);
}

async function runScopedDoctor(
  deps: Deps,
  output: CLIOutput,
  projectRoot: string,
  toolId: ToolId,
  pluginName: string | undefined
): Promise<void> {
  const category = categoryOf(toolId);
  // DoctorUseCase only scopes by category (ai/ide), not by individual tool — same
  // granularity `ai doctor`/`ide doctor` already had. The inventory line below still
  // narrows to the exact tool; only the issue list stays category-wide.
  const doctorReport = await deps.doctorUseCase.execute({ projectRoot, category, pluginName });
  const statusReport = await deps.statusUseCase.execute({
    projectRoot,
    filterToolId: toolId,
    pluginName,
  });

  const scopedReport: DoctorReport = {
    ...doctorReport,
    toolHealth: doctorReport.toolHealth.filter((h) => h.toolId === toolId),
  };
  printInventory(output, toolId, scopedReport, statusReport.tools);

  output.print("\nDrift:");
  printScopeReport(output, statusReport);
  output.print("Plugins:");
  printPluginDrift(output, { pluginDrift: statusReport.pluginDrift });

  // Same plugin-scoped gate as the unscoped path above — see the comment there.
  const healthy =
    pluginName !== undefined ? doctorReport.pluginIssues.length === 0 : doctorReport.healthy;
  if (healthy) {
    output.success("\nInstallation is healthy");
    return;
  }

  if (pluginName === undefined) {
    printScopeIssues(output, toolId, doctorReport);
  }
  printPluginIssues(output, doctorReport.pluginIssues);
  process.exit(1);
}

interface DoctorCmdOptions {
  tool?: string;
  plugin?: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description(
      "Detected and equipped tools, plugins, drift, and problems — across all tools or one"
    )
    .option("--tool <tool>", "Limit to a specific AI or IDE tool")
    .option("--plugin <name>", "Limit plugin checks to a specific plugin")
    .action(async (cmdOptions: DoctorCmdOptions) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        if (cmdOptions.tool !== undefined) {
          await runScopedDoctor(
            deps,
            output,
            projectRoot,
            cmdOptions.tool as ToolId,
            cmdOptions.plugin
          );
        } else {
          await runFullDoctor(deps, output, projectRoot, cmdOptions.plugin);
        }
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}

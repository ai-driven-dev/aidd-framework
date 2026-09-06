/** The tool axis: one row per declared tool, whether or not it contributed, so an
 * unreadable one shows its own reason instead of a false zero. */

import type { AiToolId } from "../../../../../kernel/tool.js";
import type {
  CostReportFilters,
  CostReportToolDeclaration,
  CostReportToolRow,
  TotalsAccumulator,
} from "../../cost-report.js";

/** `by_tool` is a breakdown of every *declared* tool, not only the ones a record touched -
 * that is what lets an unreadable one show its own reason instead of a false zero. A
 * `--tool` filter has to narrow that same list, or every tool it excluded would still
 * print a row reading "nothing in this period" - indistinguishable from one genuinely
 * measured idle, exactly the lie a filter's whole point is to remove. */
export function declaredToolsInScope(
  declaredTools: readonly CostReportToolDeclaration[],
  filters: CostReportFilters | undefined
): readonly CostReportToolDeclaration[] {
  const wanted = filters?.tool;
  return wanted === undefined
    ? declaredTools
    : declaredTools.filter((tool) => tool.tool === wanted);
}

/** Every declared tool gets a row, in the declared order, whether or not it contributed -
 * a tool absent from the output is a tool a reader assumes did nothing, and for an
 * unreadable one that assumption is exactly the false zero this layer exists to prevent. */
export function buildToolRows(
  declaredTools: readonly CostReportToolDeclaration[],
  measured: ReadonlyMap<AiToolId, TotalsAccumulator>,
  sessionTotals: ReadonlyMap<AiToolId, TotalsAccumulator>
): readonly CostReportToolRow[] {
  return declaredTools.map((declaration) => {
    const session = sessionTotals.get(declaration.tool);
    return {
      tool: declaration.tool,
      coverage: declaration.coverage,
      ...(declaration.reason === undefined ? {} : { reason: declaration.reason }),
      capability: declaration.capability,
      totals: measured.get(declaration.tool)?.build() ?? { requests: 0 },
      ...(session === undefined ? {} : { sessionTotals: session.build() }),
    };
  });
}

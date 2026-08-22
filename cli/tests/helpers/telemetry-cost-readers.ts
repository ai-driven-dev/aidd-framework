import { createRequire } from "node:module";

/**
 * The plugin's own cost-report declarations are zero-dependency CommonJS, bundled verbatim
 * into every tool's installed plugin directory so a live session can compute a report
 * without the `aidd` package — see `plugins/aidd-telemetry/skills/01-cost/scripts/lib/
 * readers.js`. Tests reach it here rather than duplicating its `TOOLS` table, the same
 * pattern `telemetry-journal-hook.ts` uses for the hook side: a field the plugin stops
 * declaring becomes a read of `undefined`, which fails loudly rather than silently.
 */
interface CostReaderDeclaration {
  tool: string;
  capability: {
    journalAttributable: boolean;
    taskAttributable: boolean;
  };
}

interface TelemetryCostReadersModule {
  TOOLS: readonly CostReaderDeclaration[];
}

export const telemetryCostReaders: TelemetryCostReadersModule = createRequire(import.meta.url)(
  "../../../plugins/aidd-telemetry/skills/01-cost/scripts/lib/readers.js"
);

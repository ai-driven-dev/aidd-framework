import type { AiToolId } from "../models/tool-ids.js";

/**
 * What a tool's own on-disk configuration says about whether its OTLP export can run for
 * the session being checked, and whether the setting that would strip the identifier a
 * record gets joined on is present. `checked` names every file actually read, so a
 * `missingDetail` can say exactly where nothing was found rather than gesturing at "the
 * config". `configured` and `identityDisabled` are independent: a tool can have export
 * turned on and still carry the setting that breaks the join.
 */
export interface ExportConfig {
  readonly checked: readonly string[];
  readonly configured: boolean;
  readonly configuredDetail?: string;
  readonly missingDetail?: string;
  readonly identityDisabled: boolean;
  readonly identityDisabledDetail?: string;
}

/**
 * Reads whichever tool `resolveCurrentTool` named, from that tool's own configuration —
 * never inferred from whether any exported data has actually shown up yet, which is
 * `identifier joinable`'s job. `null` when the current tool is neither of the two ever
 * measured this way (see `domain/models/session-anchor.ts`): a tool this cannot name is a
 * tool this has nothing to check, not a tool assumed unconfigured.
 */
export interface ExportConfigReader {
  read(
    tool: AiToolId | undefined,
    projectRoot: string,
    homeDir: string
  ): Promise<ExportConfig | null>;
}

import type { TelemetryLocalRead } from "../../../kernel/measurement.js";
import type { AiToolId, IdeToolId } from "../../../kernel/tool.js";
import type { ToolBuildContract } from "./build-contract.js";
import type { AgentsCapability } from "./capabilities/agents-capability.js";
import type { CommandsCapability } from "./capabilities/commands-capability.js";
import type { HooksCapability } from "./capabilities/hooks-capability.js";
import type { McpCapability } from "./capabilities/mcp-capability.js";
import type { PluginsCapability } from "./capabilities/plugins-capability.js";
import type { RulesCapability } from "./capabilities/rules-capability.js";
import type { SettingsCapability } from "./capabilities/settings-capability.js";
import type { SkillsCapability } from "./capabilities/skills-capability.js";

export interface HasAgents {
  readonly agents: AgentsCapability;
}

export interface HasSkills {
  readonly skills: SkillsCapability;
}

export interface HasCommands {
  readonly commands: CommandsCapability;
}

export interface HasRules {
  readonly rules: RulesCapability;
}

export interface HasMcp {
  readonly mcp: McpCapability;
}

export interface HasHooks {
  readonly hooks: HooksCapability;
}

export interface HasSettings {
  readonly settings: SettingsCapability | SettingsCapability[];
}

export interface HasPlugins {
  readonly plugins: PluginsCapability;
}

export interface AiTool<C> {
  readonly kind: "ai";
  readonly toolId: AiToolId;
  /** How the vendor writes it. `toolId` is a key, not a name: nothing user-facing
   * should print `copilot` where a person reads "GitHub Copilot". */
  readonly displayName: string;
  /** Whether this tool's own file(s) can be read locally for a session's counters — see
   * {@link TelemetryLocalRead}. */
  readonly telemetryLocalRead: TelemetryLocalRead;
  /** How the run journal's hook names this tool in its own `session_start` line — not the same
   * string as `toolId`, since the hook detects a host from a payload's shape and spells Claude
   * Code `claude-code`. Absent for a tool the journal hook does not run under. */
  readonly telemetryJournalHost?: string;
  /** Whether a session on this tool can be traced to the task it worked on: true wherever
   * `journal.cjs`'s `tool-used` dispatch reaches the host at all, since a task can be *declared*
   * — a tool call's own arguments named a file under a task folder — asking nothing of the
   * host's payload shape. `false` would mean no tool-used event ever reaches that host, which a
   * declaration cannot work around. A tool declaring `false` is still reportable by period and
   * by step; it simply belongs to no task. The truth lives in the framework's own hook scripts,
   * which this side cannot import, so it is declared here and pinned by a test. */
  readonly telemetryTaskAttributable: boolean;
  readonly directory: string;
  readonly toolSuffix: string;
  readonly signalDir: string | null;
  readonly capabilities: C;
  readonly configOutputPaths?: Readonly<Record<string, string>>;
  /** The tool's framework-build contracts, one per supported build mode, so the build registry
   * is derived from the registered tools instead of a hand-kept list of tool/mode pairs. */
  readonly buildContracts?: {
    readonly marketplace?: () => ToolBuildContract;
    readonly flat?: () => ToolBuildContract;
  };
  /** Where this tool's plugin manifest and marketplace catalog sit inside a distribution it
   * produced, so a sixth tool declares its own layout instead of joining two lists it does not
   * own. Order is irrelevant: the collected probes are sorted deepest-path-first, so a specific
   * location always wins over a bare `plugin.json` at the root. */
  readonly distributionProbes?: {
    readonly manifest?: readonly string[];
    readonly marketplace?: readonly string[];
  };
  rewriteContent(content: string): string;
}

export interface IdeToolConfig {
  readonly kind: "ide";
  readonly toolId: IdeToolId;
  readonly directory: string;
  readonly signalDir: string | null;
}

/** Whether this tool declares a rules capability at all. Generic over the tool's own capability
 * set so a caller keeps whatever it had already narrowed. */
export function hasRules<TCapabilities>(
  tool: AiTool<TCapabilities>
): tool is AiTool<TCapabilities & HasRules> {
  return "rules" in (tool.capabilities as object);
}

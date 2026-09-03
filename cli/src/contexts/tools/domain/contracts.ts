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
  readonly directory: string;
  readonly toolSuffix: string;
  readonly signalDir: string | null;
  readonly capabilities: C;
  readonly configOutputPaths?: Readonly<Record<string, string>>;
  /**
   * The tool's framework-build contracts, one per supported build mode. Read by
   * `buildContractFor()` so `deps.ts` can derive its build registry from the set of
   * registered tools instead of listing every tool/mode pair by hand.
   */
  readonly buildContracts?: {
    readonly marketplace?: () => ToolBuildContract;
    readonly flat?: () => ToolBuildContract;
  };
  /**
   * Where this tool's plugin manifest and marketplace catalog sit inside a distribution
   * it produced. Read by `translate` to recognise a directory's format, so a sixth tool
   * declares its own layout instead of being added to two lists it does not own.
   *
   * Order does not matter here: the collected probes are sorted deepest-path-first, so
   * a specific location always wins over a bare `plugin.json` at the root.
   */
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

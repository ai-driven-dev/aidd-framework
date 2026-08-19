import type { AgentsCapability } from "../capabilities/agents-capability.js";
import type { CommandsCapability } from "../capabilities/commands-capability.js";
import type { HooksCapability } from "../capabilities/hooks-capability.js";
import type { McpCapability } from "../capabilities/mcp-capability.js";
import type { PluginsCapability } from "../capabilities/plugins-capability.js";
import type { RulesCapability } from "../capabilities/rules-capability.js";
import type { SettingsCapability } from "../capabilities/settings-capability.js";
import type { SkillsCapability } from "../capabilities/skills-capability.js";
import type { TelemetryActivation, TelemetryExport } from "../capabilities/telemetry-capability.js";
import type { AiToolId, IdeToolId } from "../models/tool-ids.js";

export type UserFileSection = "agents" | "commands" | "rules" | "skills";

export interface UserFileSectionKey {
  section: UserFileSection;
  key: string;
}

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
  // Not a capability: `capabilities` holds what varies between tools, and every AI tool
  // has a telemetry story — the union covers the tools AIDD cannot enable.
  readonly telemetry: TelemetryActivation;
  /** What the tool's OTLP export actually carries, measured independently of whether
   * AIDD can enable it — see {@link TelemetryExport}. */
  readonly telemetryExport: TelemetryExport;
  readonly directory: string;
  readonly toolSuffix: string;
  readonly signalDir: string | null;
  readonly requiredIdeIds?: readonly IdeToolId[];
  readonly capabilities: C;
  readonly configOutputPaths?: Readonly<Record<string, string>>;
  rewriteContent(content: string, docsDir: string): string;
  reverseRewriteContent(content: string, docsDir: string): string;
  detectUserFileSectionKey(relativePath: string): UserFileSectionKey | null;
}

export interface IdeToolConfig {
  readonly kind: "ide";
  readonly toolId: IdeToolId;
  readonly directory: string;
  readonly signalDir: string | null;
}

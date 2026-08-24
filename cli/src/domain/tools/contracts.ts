import type { AgentsCapability } from "../capabilities/agents-capability.js";
import type { CommandsCapability } from "../capabilities/commands-capability.js";
import type { HooksCapability } from "../capabilities/hooks-capability.js";
import type { McpCapability } from "../capabilities/mcp-capability.js";
import type { PluginsCapability } from "../capabilities/plugins-capability.js";
import type { RulesCapability } from "../capabilities/rules-capability.js";
import type { SettingsCapability } from "../capabilities/settings-capability.js";
import type { SkillsCapability } from "../capabilities/skills-capability.js";
import type {
  TelemetryActivation,
  TelemetryExport,
  TelemetryLocalRead,
} from "../capabilities/telemetry-capability.js";
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
  /** Whether this tool's own file(s) can be read locally for a session's counters — see
   * {@link TelemetryLocalRead}. Independent of `telemetryExport`: a tool can be readable
   * by one route, both, or neither. */
  readonly telemetryLocalRead: TelemetryLocalRead;
  /** How the run journal's hook names this tool in its own `session_start` line, when the
   * hook writes for it at all. Not the same string as `toolId` — the hook detects a host
   * from the shape of a payload and spells Claude Code `claude-code`, while `toolId` is
   * `claude`. Declared here so a report joining a journal to its records reads one
   * declaration rather than carrying a table of four; a fifth host is a fifth declaration.
   * Absent for a tool the journal hook does not run under. */
  readonly telemetryJournalHost?: string;
  /** Whether a session on this tool can be traced to the task it worked on. Once true only
   * where the journal hook could read a written path out of that tool's own hook payload;
   * now true for every host `journal.cjs`'s `tool-used` dispatch reaches at all, because a
   * task can be *declared* - a tool call's own arguments named a file under a task folder,
   * read the same way `step_start` reads which skill is running, asking nothing of the
   * host's payload shape. `false` remains where no tool-used event ever reaches the host in
   * the first place (OpenCode's plugin observes only session lifecycle events), which a
   * declaration cannot work around any more than a written path could. The truth lives in
   * `hooks/lib/task-declared.cjs` and `hooks/journal.cjs`'s dispatch, inside a zero-dependency
   * script the framework build copies verbatim and this side cannot import, so it is
   * declared here and pinned to `journalAttributable` by a test — the same arrangement
   * `telemetryJournalHost` already uses for `DECLARED_HOSTS`.
   *
   * A tool declaring `false` is still fully reportable by period, and by step wherever a
   * journal covers it. It simply belongs to no task, which is not the same as having
   * touched nothing. */
  readonly telemetryTaskAttributable: boolean;
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

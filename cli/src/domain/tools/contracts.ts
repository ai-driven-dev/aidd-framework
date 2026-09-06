import type { AgentsCapability } from "../capabilities/agents-capability.js";
import type { CommandsCapability } from "../capabilities/commands-capability.js";
import type { HooksCapability } from "../capabilities/hooks-capability.js";
import type { McpCapability } from "../capabilities/mcp-capability.js";
import type { PluginsCapability } from "../capabilities/plugins-capability.js";
import type { RulesCapability } from "../capabilities/rules-capability.js";
import type { SettingsCapability } from "../capabilities/settings-capability.js";
import type { SkillsCapability } from "../capabilities/skills-capability.js";
import type { TelemetryLocalRead } from "../capabilities/telemetry-capability.js";
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
  /** Whether this tool's own file(s) can be read locally for a session's counters — see
   * {@link TelemetryLocalRead}. This is the one route this system reads: nothing here
   * declares an export, because nothing configures one any more. */
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
   * host's payload shape. `false` would remain where no tool-used event ever reaches the
   * host in the first place, which a declaration cannot work around any more than a written
   * path could - a case every declared host has cleared as of 2026-08-31, OpenCode included:
   * its plugin's `event` hook does receive a completed tool call's own arguments
   * (`hooks/opencode-plugin.js`'s `declaredTaskCallFor`), a bounded measurement settled
   * rather than assumed either way. The truth lives in `hooks/lib/task-declared.cjs` and
   * `hooks/journal.cjs`'s dispatch, inside a zero-dependency script the framework build
   * copies verbatim and this side cannot import, so it is declared here and pinned to
   * `journalAttributable` by a test — the same arrangement `telemetryJournalHost` already
   * uses for `DECLARED_HOSTS`.
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

/** Whether this tool declares a rules capability at all.
 *
 * Generic over the tool's own capability set so a caller keeps whatever it had already
 * narrowed: `plugin-content-translator.ts` asks it of a tool it has narrowed to
 * `HasPlugins` and keeps that, while a caller holding an unnarrowed tool gets `HasRules`
 * alone. It lived privately in that translator until a second caller needed it; a copy
 * beside it would have been free to answer differently about the same tool.
 */
export function hasRules<TCapabilities>(
  tool: AiTool<TCapabilities>
): tool is AiTool<TCapabilities & HasRules> {
  return "rules" in (tool.capabilities as object);
}

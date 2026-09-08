import { join } from "node:path";
import {
  CategoryMismatchError,
  UnknownToolCategoryError,
  UnregisteredToolError,
} from "../../../kernel/errors.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import {
  AI_TOOL_IDS,
  type AiToolId,
  IDE_TOOL_IDS,
  type IdeToolId,
  type ToolCategory,
  type ToolId,
} from "../../../kernel/tool.js";
import type { ToolBuildContract } from "./build-contract.js";
import type { NativeActivation, PluginsCapability } from "./capabilities/plugins-capability.js";
import type { AiTool, IdeToolConfig } from "./contracts.js";

/**
 * Output layout discriminant: marketplace dist (Mode A) vs direct workspace inject (Mode B
 * flat). Declared here, not by translate, because it is read off a tool's own plugins
 * capability (see `frameworkBuildModeFor` below) — a tool's build mode is tool knowledge.
 */
export type FrameworkBuildMode = "marketplace" | "flat";

export type ToolConfig = AiTool<unknown> | IdeToolConfig;

export function isAiTool(config: ToolConfig): config is AiTool<unknown> {
  return config.kind === "ai";
}

export function toolIdsForCategory(category: ToolCategory): readonly ToolId[] {
  switch (category) {
    case "ai":
      return AI_TOOL_IDS;
    case "ide":
      return IDE_TOOL_IDS;
    default: {
      const _exhaustive: never = category;
      throw new UnknownToolCategoryError(String(_exhaustive));
    }
  }
}

export function isIdeToolId(id: string): id is IdeToolId {
  return (IDE_TOOL_IDS as readonly string[]).includes(id);
}

export function assertToolIdsMatchCategory(toolIds: ToolId[], category: ToolCategory): void {
  const allowed = toolIdsForCategory(category);
  const wrong = toolIds.filter((id) => !(allowed as readonly string[]).includes(id));
  if (wrong.length === 0) return;
  throw new CategoryMismatchError(wrong, category, allowed);
}

const TOOL_REGISTRY = new Map<ToolId, ToolConfig>();

export function registerTool(config: ToolConfig): void {
  TOOL_REGISTRY.set(config.toolId, config);
}

export function getToolConfig(toolId: ToolId): ToolConfig {
  const config = TOOL_REGISTRY.get(toolId);
  if (!config) throw new UnregisteredToolError(toolId);
  return config;
}

export function getAiToolConfig(toolId: AiToolId): AiTool<unknown> {
  const config = getToolConfig(toolId);
  if (!isAiTool(config)) throw new UnregisteredToolError(toolId);
  return config;
}

/** The `AiToolId` whose declaration claims a journal host, or `null` for a host no
 * registered tool claims. The only place the journal hook's host names and this codebase's
 * tool ids are related, and it relates them by reading declarations rather than by holding
 * a table that a fifth host would have to be remembered into. */
export function journalHostToAiToolId(journalHost: string): AiToolId | null {
  for (const toolId of AI_TOOL_IDS) {
    if (getAiToolConfig(toolId).telemetryJournalHost === journalHost) return toolId;
  }
  return null;
}

export function getAllRegisteredTools(): Map<ToolId, ToolConfig> {
  return new Map(TOOL_REGISTRY);
}

export async function hasToolSignals(
  fs: FileReader,
  config: ToolConfig,
  projectRoot: string
): Promise<string[]> {
  if (!config.signalDir) return [];
  const dir = join(projectRoot, config.signalDir);
  if (!(await fs.fileExists(dir))) return [];
  const files = await fs.listDirectory(dir);
  const matches: string[] = [];
  for (const filePath of files) {
    if (!filePath.endsWith(".md")) continue;
    const content = await fs.readFile(join(dir, filePath));
    if (/^name:\s*['"]?aidd[_:]/m.test(content)) matches.push(join(config.signalDir, filePath));
  }
  return matches;
}

/**
 * The tool's native plugin CLI declaration, or undefined when it has none.
 * Read from the profile so the set of driven tools is data, not a hand-kept list.
 */
export function nativeActivationOf(toolId: ToolId): NativeActivation | undefined {
  return resolvePluginsCapability(toolId)?.nativeActivation ?? undefined;
}

/**
 * How the framework must be built for a tool: flat when the tool's plugins capability
 * is flat, a marketplace otherwise. Read from the profile rather than branched on the
 * tool's name, so a sixth flat tool needs no edit outside its own profile.
 */
export function frameworkBuildModeFor(toolId: ToolId): FrameworkBuildMode {
  return resolvePluginsCapability(toolId)?.mode === "flat" ? "flat" : "marketplace";
}

/**
 * Whether this tool enables a plugin for the whole machine rather than for one
 * project alone — a tool declaring no `NativeActivation.scopeArgs` at all (codex,
 * copilot) has nothing to tell `enablePlugin`/`uninstallPlugin` which scope to ask
 * for, so its own CLI always acts machine-wide regardless of which scope `aidd`
 * itself ran at. Read from the profile, never a `toolId === "codex"` branch: a tool
 * declares, a context reads (`architecture.md`). Also `true` for a tool with no
 * native activation at all, since `nativeActivationOf` then answers `undefined` too —
 * never asked in practice, since a caller only reaches for this once it already knows
 * the ref came from a tool that has one.
 */
export function pluginEnablementIsMachineGlobal(toolId: ToolId): boolean {
  return nativeActivationOf(toolId)?.scopeArgs === undefined;
}

/**
 * Whether `--scope user` has anywhere to point this tool at all: either it drives its
 * own CLI machine-wide (`NativeActivation`, claude/codex/copilot), or it installs a
 * plugin's files straight into a user-scope directory (`installScope: "user"`, cursor).
 * `false` for a tool whose plugins capability declares neither — opencode today, whose
 * flat mode has no user-scope directory to write into and no CLI to drive.
 */
export function supportsUserScopeActivation(toolId: ToolId): boolean {
  const capability = resolvePluginsCapability(toolId);
  if (capability === null) return false;
  return capability.nativeActivation !== null || capability.installScope === "user";
}

/**
 * The tool's declared build contract for one framework-build mode, or undefined when
 * the tool does not support that mode (e.g. opencode has no marketplace mode). Read
 * from the profile so `runtime/wiring/framework.ts` can derive its build registry by iterating the
 * registered tools instead of listing every tool/mode pair by hand.
 */
export function buildContractFor(
  toolId: ToolId,
  mode: FrameworkBuildMode
): (() => ToolBuildContract) | undefined {
  const config = getToolConfig(toolId);
  if (!isAiTool(config)) return undefined;
  return config.buildContracts?.[mode];
}

/**
 * A tool's own user-scope settings/registry file, absolute under `homedir` — never
 * written by aidd, read only by `doctor --scope user`'s own display, which names it
 * rather than diffing it. Declared here rather than guessed at the call site, the same
 * reasoning `machineLocalFilesOf` already carries for the project-relative case. Empty
 * for a tool whose profile declares no `NativeActivation.userSettingsPath` — opencode
 * and cursor today.
 */
export function userMachineLocalFilesOf(toolId: ToolId, homedir: string): readonly string[] {
  const path = nativeActivationOf(toolId)?.userSettingsPath?.(homedir);
  return path === undefined ? [] : [path];
}

/**
 * Files this CLI writes for a tool and deliberately does not track.
 *
 * Their content names absolute paths, so they describe one machine: committing them
 * would hand a teammate a pointer that cannot resolve, and hashing them would make
 * every other machine read as drift. Untracked is the point, so neither `status` nor
 * the gitignore should treat them as something the user added.
 */
export function machineLocalFilesOf(toolId: ToolId): readonly string[] {
  const path = resolvePluginsCapability(toolId)?.marketplaceSettings?.marketplacesSettingsPath;
  // `null` means the tool has nowhere machine-local to write, so there is no such file
  // to keep out of `status` or the gitignore either.
  return typeof path === "string" ? [path] : [];
}

/**
 * The project's own hooks file a plugin's hooks are merged into, for a tool declaring
 * `hooksDestination: "project"` — `.cursor/hooks.json` for Cursor — or `undefined` for a
 * tool with nothing merged there.
 *
 * Deliberately not folded into `machineLocalFilesOf`: every entry that file names a
 * project-relative path (`.cursor/hooks/<plugin>/...`, verified in
 * `cursor-hooks-project-merge.ts`'s own doc comment), copied into the project and
 * shareable, unlike the absolute-path machine-local content `machineLocalFilesOf`
 * exists to keep out of git. `aiddGitignoreEntries` reads `machineLocalFilesOf` for
 * exactly that reason; folding this in would gitignore a file that belongs in the repo.
 */
export function projectHooksFileOf(toolId: ToolId): string | undefined {
  return resolvePluginsCapability(toolId)?.projectHooksRelativePath ?? undefined;
}

/**
 * A tool's plugin capability, or `null` when it declares none.
 *
 * Here rather than beside one of its callers: it reads nothing but this registry, and its
 * callers now span three of them — the plugin translators, plugin removal, and the telemetry
 * diagnostic. A use case reaching into a hooks materializer to ask what a tool declares is a
 * placement the layering gate happens to permit and the project's own rule does not.
 */
export function resolvePluginsCapability(toolId: ToolId): PluginsCapability | null {
  const toolConfig = getToolConfig(toolId);
  if (!isAiTool(toolConfig)) return null;
  const caps = toolConfig.capabilities as Record<string, unknown>;
  if (!("plugins" in caps)) return null;
  return caps.plugins as PluginsCapability;
}

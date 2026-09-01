export type UserFileSection = "agents" | "commands" | "rules" | "skills";

export interface UserFileSectionKey {
  section: UserFileSection;
  key: string;
}

export function stripToolSuffix(suffix: string, fileName: string): string {
  const basename = fileName.split("/").at(-1) ?? fileName;
  if (!basename.endsWith(suffix)) return fileName;
  const dir = fileName.slice(0, fileName.length - basename.length);
  const stripped = `${basename.slice(0, -suffix.length)}.md`;
  return `${dir}${stripped}`;
}

function buildCommandName(fm: Record<string, unknown>, relativeFileName: string): string {
  const phase = relativeFileName.split("/")[0]?.match(/^(\d+)/)?.[1];
  const baseName = String(fm.name ?? "");
  return phase ? `aidd:${phase}:${baseName}` : baseName;
}

function stripCommandNamePrefix(fm: Record<string, unknown>): string {
  const rawName = String(fm.name ?? "");
  const match = /^aidd:\d+:(.+)$/.exec(rawName);
  return match ? match[1] : rawName;
}

export function convertCommandFrontmatter(
  fm: Record<string, unknown>,
  relativeFileName: string
): Record<string, unknown> {
  const name = buildCommandName(fm, relativeFileName);
  const result: Record<string, unknown> = { name, description: fm.description };
  if (fm["argument-hint"] !== undefined) result["argument-hint"] = fm["argument-hint"];
  return result;
}

export function convertCommandFrontmatterNoHint(
  fm: Record<string, unknown>,
  relativeFileName: string
): Record<string, unknown> {
  const name = buildCommandName(fm, relativeFileName);
  return { name, description: fm.description };
}

export function reverseConvertCommandFrontmatter(
  fm: Record<string, unknown>
): Record<string, unknown> {
  const name = stripCommandNamePrefix(fm);
  const result: Record<string, unknown> = { name, description: fm.description };
  if (fm["argument-hint"] !== undefined) result["argument-hint"] = fm["argument-hint"];
  return result;
}

export function reverseConvertCommandFrontmatterNoHint(
  fm: Record<string, unknown>
): Record<string, unknown> {
  const name = stripCommandNamePrefix(fm);
  return { name, description: fm.description };
}

export function buildAiddCommandFilePath(dir: string, fileName: string): string {
  const slashIdx = fileName.indexOf("/");
  if (slashIdx !== -1) {
    const phaseDir = fileName.slice(0, slashIdx);
    const baseName = fileName.slice(slashIdx + 1);
    const phase = phaseDir.match(/^(\d+)/)?.[1];
    if (phase) {
      return `${dir}commands/aidd/${phase}/${baseName}`;
    }
  }
  const baseName = fileName.split("/").at(-1) ?? fileName;
  return `${dir}commands/aidd/${baseName}`;
}

export function detectSectionKeyFromPrefixes(
  relativePath: string,
  prefixes: [string, UserFileSection][]
): UserFileSectionKey | null {
  for (const [prefix, section] of prefixes) {
    if (relativePath.startsWith(prefix)) return { section, key: relativePath.slice(prefix.length) };
  }
  return null;
}

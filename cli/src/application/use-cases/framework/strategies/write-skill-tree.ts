import { join, relative } from "node:path";
import { rewriteRelativeLinks } from "../../../../domain/formats/relative-link-rewrite.js";
import type { FileReader } from "../../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../../domain/ports/file-writer.js";
import { assertNoToolsPlaceholder } from "../assert-no-tools-placeholder.js";

export async function writeSkillTree(
  fs: FileReader & FileWriter,
  pluginName: string,
  pluginSrc: string,
  pluginOut: string
): Promise<number> {
  const skillsSrc = join(pluginSrc, "skills");
  if (!(await fs.fileExists(skillsSrc))) return 0;
  const files = await fs.listFilesRecursive(skillsSrc);
  let count = 0;
  for (const absPath of files) {
    count += await writeSkillFile(fs, pluginName, absPath, skillsSrc, pluginOut);
  }
  return count;
}

async function writeSkillFile(
  fs: FileReader & FileWriter,
  pluginName: string,
  absPath: string,
  skillsSrc: string,
  pluginOut: string
): Promise<number> {
  const relPath = relative(skillsSrc, absPath).replace(/\\/g, "/");
  const destPath = join(pluginOut, "skills", relPath);
  const content = await fs.readFile(absPath);
  if (absPath.endsWith(".md")) {
    assertNoToolsPlaceholder(content, pluginName, relPath);
    const currentFilePluginRelative = `skills/${relPath}`;
    await fs.writeFile(destPath, rewriteRelativeLinks(content, { currentFilePluginRelative }));
  } else {
    await fs.writeFile(destPath, content);
  }
  return 1;
}

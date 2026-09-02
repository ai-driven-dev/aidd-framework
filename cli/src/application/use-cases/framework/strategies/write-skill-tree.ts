import { basename, join, relative } from "node:path";
import { rewriteRelativeLinks } from "../../../../domain/formats/relative-link-rewrite.js";
import { PLUGIN_SKILL_ENTRY_FILE } from "../../../../domain/models/framework-build.js";
import type { FileReader } from "../../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../../domain/ports/file-writer.js";
import { assertNoToolsPlaceholder } from "../assert-no-tools-placeholder.js";

type SkillContentTransform = (content: string, plugin: string, basename: string) => string;

export async function writeSkillTree(
  fs: FileReader & FileWriter,
  pluginName: string,
  pluginSrc: string,
  pluginOut: string,
  transform?: SkillContentTransform
): Promise<number> {
  const skillsSrc = join(pluginSrc, "skills");
  if (!(await fs.fileExists(skillsSrc))) return 0;
  const files = await fs.listFilesRecursive(skillsSrc);
  let count = 0;
  for (const absPath of files) {
    count += await writeSkillFile(fs, pluginName, absPath, skillsSrc, pluginOut, transform);
  }
  return count;
}

async function writeSkillFile(
  fs: FileReader & FileWriter,
  pluginName: string,
  absPath: string,
  skillsSrc: string,
  pluginOut: string,
  transform?: SkillContentTransform
): Promise<number> {
  const relPath = relative(skillsSrc, absPath).replace(/\\/g, "/");
  const destPath = join(pluginOut, "skills", relPath);
  const content = await fs.readFile(absPath);
  if (absPath.endsWith(".md")) {
    assertNoToolsPlaceholder(content, pluginName, relPath);
    const currentFilePluginRelative = `skills/${relPath}`;
    const rewritten = rewriteRelativeLinks(content, { currentFilePluginRelative });
    const isEntry = transform !== undefined && basename(absPath) === PLUGIN_SKILL_ENTRY_FILE;
    await fs.writeFile(
      destPath,
      isEntry ? transform(rewritten, pluginName, PLUGIN_SKILL_ENTRY_FILE) : rewritten
    );
  } else {
    await fs.writeFile(destPath, content);
  }
  return 1;
}

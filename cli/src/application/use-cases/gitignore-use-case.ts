import type { FileReader } from "../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../kernel/ports/file-writer.js";

const GITIGNORE_FILENAME = ".gitignore";

export class GitignoreUseCase {
  constructor(private readonly fs: FileReader & FileWriter) {}

  async execute(projectRoot: string, entries: string[]): Promise<void> {
    const gitignorePath = `${projectRoot}/${GITIGNORE_FILENAME}`;

    const existing = (await this.fs.fileExists(gitignorePath))
      ? await this.fs.readFile(gitignorePath)
      : "";

    const lines = existing.split("\n");
    const missing = entries.filter((entry) => !lines.some((line) => line.trim() === entry));

    if (missing.length === 0) return;

    const toAppend = existing.endsWith("\n") || existing === "" ? "" : "\n";
    await this.fs.writeFile(gitignorePath, `${existing}${toAppend}${missing.join("\n")}\n`);
  }

  async remove(projectRoot: string, entries: string[]): Promise<void> {
    const gitignorePath = `${projectRoot}/${GITIGNORE_FILENAME}`;

    if (!(await this.fs.fileExists(gitignorePath))) return;
    const existing = await this.fs.readFile(gitignorePath);

    const entrySet = new Set(entries);
    const filtered = existing
      .split("\n")
      .filter((line) => !entrySet.has(line.trim()))
      .join("\n");

    if (filtered === existing) return;

    const trimmed = filtered.replace(/^\n+|\n+$/g, "");
    if (trimmed === "") {
      await this.fs.deleteFile(gitignorePath);
      return;
    }
    await this.fs.writeFile(gitignorePath, `${trimmed}\n`);
  }
}

import type { InstallationFile } from "../../../../kernel/file.js";
import type { Hasher } from "../../../../kernel/ports/hasher.js";
import type { CommandsCapability } from "../../../tools/domain/capabilities/commands-capability.js";
import type { AiTool, HasCommands } from "../../../tools/domain/contracts.js";
import type { ContentSection } from "../../../translate/domain/canon.js";
import {
  type ContentSectionDescriptor,
  InstallContentSectionUseCase,
} from "./install-content-section-use-case.js";

const commandsDescriptor: ContentSectionDescriptor<"commands", CommandsCapability> = {
  key: "commands",
  acceptsFileName: (cap, fileName) => cap.acceptsFileName(fileName),
  convertFrontmatter: (cap, frontmatter, relativeFileName) =>
    cap.convertFrontmatter(frontmatter, relativeFileName),
};

interface InstallCommandsOptions {
  toolConfig: AiTool<HasCommands>;
  section: ContentSection;
  contentFiles: Map<string, string>;
  docsDir: string;
}

export class InstallCommandsUseCase {
  private readonly inner: InstallContentSectionUseCase<"commands", CommandsCapability>;

  constructor(hasher: Hasher) {
    this.inner = new InstallContentSectionUseCase(hasher, commandsDescriptor);
  }

  execute(options: InstallCommandsOptions): InstallationFile[] {
    return this.inner.execute(options);
  }
}

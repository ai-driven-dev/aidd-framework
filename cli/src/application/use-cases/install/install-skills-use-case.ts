import type { SkillsCapability } from "../../../contexts/tools/domain/capabilities/skills-capability.js";
import type { AiTool, HasSkills } from "../../../contexts/tools/domain/contracts.js";
import type { ContentSection } from "../../../contexts/translate/domain/canon.js";
import type { InstallationFile } from "../../../kernel/file.js";
import type { Hasher } from "../../../kernel/ports/hasher.js";
import {
  type ContentSectionDescriptor,
  InstallContentSectionUseCase,
} from "./install-content-section-use-case.js";

const skillsDescriptor: ContentSectionDescriptor<"skills", SkillsCapability> = {
  key: "skills",
  acceptsFileName: (cap, fileName) => cap.acceptsFileName(fileName),
  convertFrontmatter: (cap, frontmatter) => cap.convertFrontmatter(frontmatter),
};

interface InstallSkillsOptions {
  toolConfig: AiTool<HasSkills>;
  section: ContentSection;
  contentFiles: Map<string, string>;
  docsDir: string;
}

export class InstallSkillsUseCase {
  private readonly inner: InstallContentSectionUseCase<"skills", SkillsCapability>;

  constructor(hasher: Hasher) {
    this.inner = new InstallContentSectionUseCase(hasher, skillsDescriptor);
  }

  execute(options: InstallSkillsOptions): InstallationFile[] {
    return this.inner.execute(options);
  }
}

import type { SkillsCapability } from "../../../domain/capabilities/skills-capability.js";
import type { InstallationFile } from "../../../domain/models/file.js";
import type { ContentSection } from "../../../domain/models/framework.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { AiTool, HasSkills } from "../../../domain/tools/contracts.js";
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

import type { RulesCapability } from "../../../domain/capabilities/rules-capability.js";
import type { InstallationFile } from "../../../domain/models/file.js";
import type { ContentSection } from "../../../domain/models/framework.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { AiTool, HasRules } from "../../../domain/tools/contracts.js";
import {
  type ContentSectionDescriptor,
  InstallContentSectionUseCase,
} from "./install-content-section-use-case.js";

const rulesDescriptor: ContentSectionDescriptor<"rules", RulesCapability> = {
  key: "rules",
  acceptsFileName: (cap, fileName) => cap.acceptsFileName(fileName),
  convertFrontmatter: (cap, frontmatter) => cap.convertFrontmatter(frontmatter),
};

interface InstallRulesOptions {
  toolConfig: AiTool<HasRules>;
  section: ContentSection;
  contentFiles: Map<string, string>;
  docsDir: string;
}

export class InstallRulesUseCase {
  private readonly inner: InstallContentSectionUseCase<"rules", RulesCapability>;

  constructor(hasher: Hasher) {
    this.inner = new InstallContentSectionUseCase(hasher, rulesDescriptor);
  }

  execute(options: InstallRulesOptions): InstallationFile[] {
    return this.inner.execute(options);
  }
}

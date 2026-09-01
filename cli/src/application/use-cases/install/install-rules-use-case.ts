import type { RulesCapability } from "../../../contexts/tools/domain/capabilities/rules-capability.js";
import type { AiTool, HasRules } from "../../../contexts/tools/domain/contracts.js";
import type { ContentSection } from "../../../contexts/translate/domain/canon.js";
import type { InstallationFile } from "../../../kernel/file.js";
import type { Hasher } from "../../../kernel/ports/hasher.js";
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

import type { InstallationFile } from "../../../../../kernel/file.js";
import type { Hasher } from "../../../../../kernel/ports/hasher.js";
import type { AgentsCapability } from "../../../../tools/domain/capabilities/agents-capability.js";
import type { AiTool, HasAgents } from "../../../../tools/domain/contracts.js";
import type { ContentSection } from "../../../../translate/domain/canon.js";
import {
  type ContentSectionDescriptor,
  InstallContentSectionUseCase,
} from "./install-content-section-use-case.js";

const agentsDescriptor: ContentSectionDescriptor<"agents", AgentsCapability> = {
  key: "agents",
  acceptsFileName: (cap, fileName, allToolSuffixes) =>
    cap.acceptsFileName(fileName, allToolSuffixes),
  convertFrontmatter: (cap, frontmatter, relativeFileName) =>
    cap.convertFrontmatter(frontmatter, relativeFileName),
};

interface InstallAgentsOptions {
  toolConfig: AiTool<HasAgents>;
  section: ContentSection;
  contentFiles: Map<string, string>;
}

export class InstallAgentsUseCase {
  private readonly inner: InstallContentSectionUseCase<"agents", AgentsCapability>;

  constructor(hasher: Hasher) {
    this.inner = new InstallContentSectionUseCase(hasher, agentsDescriptor);
  }

  execute(options: InstallAgentsOptions): InstallationFile[] {
    return this.inner.execute(options);
  }
}

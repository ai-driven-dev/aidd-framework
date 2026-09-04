import type { VersionReader } from "../../../../kernel/ports/version-reader.js";
import type { AiToolId } from "../../../../kernel/tool.js";
import { isAiToolId } from "../../../../kernel/tool.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type { UpdateOneToolUseCase } from "./update-one-tool-use-case.js";
import { UpdateToolsUseCase } from "./update-tools-use-case.js";

export class UpdateAiToolsUseCase extends UpdateToolsUseCase<AiToolId> {
  constructor(
    manifestRepo: ManifestRepository,
    versionReader: VersionReader,
    updateOneToolUseCase: UpdateOneToolUseCase
  ) {
    super(manifestRepo, versionReader, updateOneToolUseCase, isAiToolId);
  }
}

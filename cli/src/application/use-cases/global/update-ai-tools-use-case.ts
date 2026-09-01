import type { AiToolId } from "../../../domain/models/tool-ids.js";
import { isAiToolId } from "../../../domain/models/tool-ids.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { VersionReader } from "../../../domain/ports/version-reader.js";
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

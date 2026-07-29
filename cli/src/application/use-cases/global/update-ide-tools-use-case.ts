import type { IdeToolId } from "../../../domain/models/tool-ids.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { VersionReader } from "../../../domain/ports/version-reader.js";
import { isIdeToolId } from "../../../domain/tools/registry.js";
import type { UpdateOneToolUseCase } from "../shared/update-one-tool-use-case.js";
import type { UpdateToolsInput, UpdateToolsResult } from "./update-tools-use-case.js";
import { UpdateToolsUseCase } from "./update-tools-use-case.js";

export type UpdateIdeToolsInput = UpdateToolsInput<IdeToolId>;
export type UpdateIdeToolsResult = UpdateToolsResult;

export class UpdateIdeToolsUseCase extends UpdateToolsUseCase<IdeToolId> {
  constructor(
    manifestRepo: ManifestRepository,
    versionReader: VersionReader,
    updateOneToolUseCase: UpdateOneToolUseCase
  ) {
    super(manifestRepo, versionReader, updateOneToolUseCase, isIdeToolId);
  }
}

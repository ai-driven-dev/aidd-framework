import type { VersionReader } from "../../../../kernel/ports/version-reader.js";
import type { IdeToolId } from "../../../../kernel/tool.js";
import { isIdeToolId } from "../../../tools/domain/registry.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type { UpdateOneToolUseCase } from "./update-one-tool-use-case.js";
import { UpdateToolsUseCase } from "./update-tools-use-case.js";

export class UpdateIdeToolsUseCase extends UpdateToolsUseCase<IdeToolId> {
  constructor(
    manifestRepo: ManifestRepository,
    versionReader: VersionReader,
    updateOneToolUseCase: UpdateOneToolUseCase
  ) {
    super(manifestRepo, versionReader, updateOneToolUseCase, isIdeToolId);
  }
}

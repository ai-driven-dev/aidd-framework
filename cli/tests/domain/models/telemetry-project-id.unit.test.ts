import { describe, expect, it } from "vitest";
import {
  parseOwnerRepoFromRemote,
  sanitizeProjectId,
} from "../../../src/domain/models/telemetry-project-id.js";
import { journalRepo } from "../../helpers/telemetry-journal-hook.js";

const REMOTE_URLS = [
  "git@github.com:ai-driven-dev/framework.git",
  "https://github.com/ai-driven-dev/framework.git",
  "https://gitlab.com/group/subgroup/repo.git",
  null,
  "not a remote url",
];

// Duplicated on purpose, not shared at runtime — see telemetry-project-id.ts's doc
// comment for why. This is what proves the duplication stays honest: the CLI's copy
// must return byte-identical output to the journal hook's real function, forever.
describe("parseOwnerRepoFromRemote — agrees with the journal hook's own function", () => {
  it.each(REMOTE_URLS)("matches for %s", (remoteUrl) => {
    expect(parseOwnerRepoFromRemote(remoteUrl)).toBe(
      journalRepo.parseOwnerRepoFromRemote(remoteUrl)
    );
  });
});

describe("sanitizeProjectId — agrees with the journal hook's own function", () => {
  it.each(["ai-driven-dev/framework", "a b/c..d", "weird/../chars?", "no-slash"])(
    "matches for %s",
    (projectId) => {
      expect(sanitizeProjectId(projectId)).toBe(journalRepo.sanitizeProjectId(projectId));
    }
  );
});

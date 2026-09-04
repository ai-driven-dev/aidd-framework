import { describe, expect, it } from "vitest";
import { namesTheSameSkill } from "../../../src/domain/models/skill-name.js";

describe("namesTheSameSkill — one skill, two hosts, two spellings", () => {
  it("holds for the identical spelling", () => {
    expect(namesTheSameSkill("aidd-dev:01-plan", "aidd-dev:01-plan")).toBe(true);
    expect(namesTheSameSkill("01-plan", "01-plan")).toBe(true);
  });

  it("holds when only one side carries the plugin, whichever side that is", () => {
    // The case this exists for: Cursor and Codex open a step as `01-plan`, and the end the
    // skill echoes always says `aidd-dev:01-plan`.
    expect(namesTheSameSkill("01-plan", "aidd-dev:01-plan")).toBe(true);
    expect(namesTheSameSkill("aidd-dev:01-plan", "01-plan")).toBe(true);
  });

  it("never folds two qualified names together, however alike their skill halves", () => {
    expect(namesTheSameSkill("aidd-dev:01-plan", "aidd-pm:01-plan")).toBe(false);
  });

  it("says no to two skills that share no name at all", () => {
    expect(namesTheSameSkill("aidd-dev:01-plan", "aidd-dev:06-test")).toBe(false);
    expect(namesTheSameSkill("01-plan", "06-test")).toBe(false);
  });

  it("drops the plugin at the first colon, the one shape this domain has", () => {
    // A hyphenated skill name is still one name; only the `plugin:` prefix comes off.
    expect(namesTheSameSkill("artifact-design", "aidd-context:artifact-design")).toBe(true);
    expect(namesTheSameSkill("artifact-design", "aidd-context:artifact-diagramming")).toBe(false);
  });
});

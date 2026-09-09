/** Two hosts spell one skill differently — `aidd-dev:01-plan` where the argument is passed, the
 * bare `01-plan` from a `SKILL.md` path — so an exact comparison would leave the interval open.
 * Two qualified spellings that disagree never fold; a bare one closes whichever skill is open. */
export function namesTheSameSkill(one: string, other: string): boolean {
  if (one === other) return true;
  const oneQualified = one.includes(":");
  const otherQualified = other.includes(":");
  if (oneQualified && otherQualified) return false;
  return bareSkillName(one) === bareSkillName(other);
}

/** The name with any `plugin:` prefix dropped. The separator is the first colon, the one
 * shape this domain has: `plugin:skill`, or a bare `skill`. */
function bareSkillName(skill: string): string {
  const separator = skill.indexOf(":");
  return separator === -1 ? skill : skill.slice(separator + 1);
}

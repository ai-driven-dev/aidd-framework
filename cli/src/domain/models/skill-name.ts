/** Whether two journal lines name the same skill, when the two hosts that wrote them do not
 * spell it the same way.
 *
 * `skill-detection.cjs` has two capture routes and each writes a different spelling.
 * `skillNameFromArgument` (Claude Code, Copilot) hands over the host's own argument,
 * `aidd-dev:01-plan`. `skillNameFromSkillFileRead` (Cursor, Codex) has no such argument and
 * falls back to the bare directory name a `SKILL.md` path names, `01-plan`. One session can
 * hold both: the start is captured by whichever route the host allows, and the end is read
 * out of the text a skill echoes, which always carries the plugin-qualified form because
 * that is what the skill knows itself as.
 *
 * So an exact comparison makes a declared end close nothing at all on Cursor and Codex -
 * `01-plan` opened, `aidd-dev:01-plan` ended, no match - and the interval falls back to the
 * next opener as if the skill had never said it was done.
 *
 * Qualified against qualified is compared whole: `aidd-dev:01-plan` and `aidd-pm:01-plan`
 * are two skills, and nothing may fold them together. Only when one side carries no plugin
 * at all does the bare name decide, because that side has nothing else to offer. The cost is
 * stated rather than hidden: an unqualified `01-plan` closes whichever `01-plan` is open,
 * whatever plugin it came from. That is the same limit `ORCHESTRATING_SKILLS` already names
 * for a project whose own skill shares a directory name with an orchestrator - the host
 * threw the plugin away before this code ever saw the line, and no reader can put it back.
 */
export function namesTheSameSkill(one: string, other: string): boolean {
  if (one === other) return true;
  const oneQualified = one.includes(":");
  const otherQualified = other.includes(":");
  // Both spellings carry a plugin, and they disagree: two skills, never one.
  if (oneQualified && otherQualified) return false;
  return bareSkillName(one) === bareSkillName(other);
}

/** The skill's own name with any `plugin:` prefix dropped - what a host that never saw the
 * plugin would have written. The separator is the first colon, matching the one shape this
 * domain has: `plugin:skill`, or a bare `skill`. */
function bareSkillName(skill: string): string {
  const separator = skill.indexOf(":");
  return separator === -1 ? skill : skill.slice(separator + 1);
}

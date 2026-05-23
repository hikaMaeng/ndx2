const SKILLS_INTRO_WITH_ABSOLUTE_PATHS = "A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path for traceability.";
const SKILLS_INTRO_WITH_ALIASES = "A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and a short path for traceability; the skill name is the identifier to pass to `loadSkill`.";
const SKILLS_HOW_TO_USE_WITH_ABSOLUTE_PATHS = `- Discovery: The list above is the skills available in this session (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with \`$SkillName\` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill isn't in the list or can't be loaded, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1) After deciding to use a skill, call the \`loadSkill\` tool with the skill name. Continue the task after the skill instructions are returned.
  2) When loaded skill instructions reference relative paths (e.g., \`scripts/foo.py\`), resolve them relative to the skill directory in the returned \`<path>\` first, and only consider other paths if needed.
  3) If \`SKILL.md\` points to extra folders such as \`references/\`, load only the specific files needed for the request; don't bulk-load everything.
  4) If \`scripts/\` exist, prefer running or patching them instead of retyping large code blocks.
  5) If \`assets/\` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you'll use them.
  - Announce which skill(s) you're using and why (one short line). If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening files directly linked from \`SKILL.md\` unless you're blocked.
  - When variants exist (frameworks, providers, domains), pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill can't be applied cleanly (missing files, unclear instructions), state the issue, pick the next-best approach, and continue.`;
const SKILLS_HOW_TO_USE_WITH_ALIASES = SKILLS_HOW_TO_USE_WITH_ABSOLUTE_PATHS
  .replace("name + description + file path", "name + description + short path")
  .replace("Skill bodies live on disk at the listed paths.", "Skill bodies live on disk at the listed paths after expanding the matching alias from `### Skill roots`; use the displayed skill name when calling `loadSkill`.");

export function renderAvailableSkillsBody(skillRootLines: string[], skillLines: string[], warning?: string): string {
  const lines = ["## Skills"];
  if (skillRootLines.length > 0) {
    lines.push(SKILLS_INTRO_WITH_ALIASES, "### Skill roots", ...skillRootLines);
  } else {
    lines.push(SKILLS_INTRO_WITH_ABSOLUTE_PATHS);
  }
  if (warning) {
    lines.push(`> ${warning}`);
  }
  lines.push("### Available skills", ...skillLines, "### How to use skills", skillRootLines.length > 0 ? SKILLS_HOW_TO_USE_WITH_ALIASES : SKILLS_HOW_TO_USE_WITH_ABSOLUTE_PATHS);
  return `\n${lines.join("\n")}\n`;
}

import { aliasedMetadataOverheadCost, buildAliasPlan, renderAliasedPath } from "./aliases.js";
import { lineCost, textCost } from "./budget.js";
import type { AvailableSkills, Budget, SkillLine, SkillMetadata } from "./types.js";

const SKILL_DESCRIPTION_TRUNCATION_WARNING_THRESHOLD_CHARS = 100;

export function buildAvailableSkills(skills: SkillMetadata[], budget: Budget): AvailableSkills | undefined {
  if (skills.length === 0) {
    return undefined;
  }

  const absolute = buildAvailableSkillsFromLines(
    skills.map((skill) => ({ name: skill.name, description: skill.description, path: skill.pathToSkillMd })),
    skills.length,
    budget,
    [],
  );
  const aliases = buildAliasPlan(skills);
  const aliasOverhead = aliases.length > 0 ? aliasedMetadataOverheadCost(budget, aliases) : 0;
  const aliased = aliases.length > 0 && aliasOverhead < budget.limit
    ? buildAvailableSkillsFromLines(
      skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        path: renderAliasedPath(skill, aliases),
      })),
      skills.length,
      { ...budget, limit: budget.limit - aliasOverhead },
      aliases.map((root, index) => `- \`r${index}\` = \`${root}\``),
    )
    : undefined;

  if (aliased) {
    const aliasedCost = aliased.skillLines.reduce((sum, line) => sum + lineCost(budget, line), 0)
      + (aliased.skillRootLines.length > 0 ? textCost(budget, aliased.skillRootLines.join("\n")) : 0);
    const absoluteCost = absolute.skillLines.reduce((sum, line) => sum + lineCost(budget, line), 0)
      + (absolute.skillRootLines.length > 0 ? textCost(budget, absolute.skillRootLines.join("\n")) : 0);
    return aliasedCost < absoluteCost ? aliased : absolute;
  }

  return absolute;
}

function buildAvailableSkillsFromLines(
  lines: SkillLine[],
  totalCount: number,
  budget: Budget,
  skillRootLines: string[],
): AvailableSkills {
  const fullCost = lines.reduce((used, line) => {
    const rendered = line.description
      ? `- ${line.name}: ${line.description} (file: ${line.path})`
      : `- ${line.name}: (file: ${line.path})`;
    return used + lineCost(budget, rendered);
  }, 0);
  if (fullCost <= budget.limit) {
    return {
      skillRootLines,
      skillLines: lines.map((line) => line.description
        ? `- ${line.name}: ${line.description} (file: ${line.path})`
        : `- ${line.name}: (file: ${line.path})`),
      totalCount,
      includedCount: lines.length,
      omittedCount: 0,
      truncatedDescriptionChars: 0,
      truncatedDescriptionCount: 0,
    };
  }

  // Minimum rendering keeps every visible skill name and file path, then spends any remaining budget on descriptions.
  const minimumCost = lines.reduce((used, line) => used + lineCost(budget, `- ${line.name}: (file: ${line.path})`), 0);
  if (minimumCost <= budget.limit) {
    const rendered = renderLinesWithDescriptionBudget(lines, budget, budget.limit - minimumCost);
    const truncatedDescriptionChars = rendered.reduce((sum, line) => sum + line.truncatedChars, 0);
    const truncatedDescriptionCount = rendered.filter((line) => line.truncatedChars > 0).length;
    return {
      skillRootLines,
      skillLines: rendered.map((line) => line.text),
      totalCount,
      includedCount: lines.length,
      omittedCount: 0,
      truncatedDescriptionChars,
      truncatedDescriptionCount,
      warningMessage: (totalCount === 0 ? 0 : Math.ceil(truncatedDescriptionChars / totalCount)) > SKILL_DESCRIPTION_TRUNCATION_WARNING_THRESHOLD_CHARS
        ? (budget.kind === "tokens"
          ? "Skill descriptions were shortened to fit the 2% skills context budget. Codex can still see every skill, but some descriptions are shorter. Disable unused skills or plugins to leave more room for the rest."
          : "Skill descriptions were shortened to fit the skills context budget. Codex can still see every skill, but some descriptions are shorter. Disable unused skills or plugins to leave more room for the rest.")
        : undefined,
    };
  }

  let used = 0;
  let omittedCount = 0;
  const skillLines: string[] = [];
  for (const line of lines) {
    const rendered = `- ${line.name}: (file: ${line.path})`;
    const cost = lineCost(budget, rendered);
    if (used + cost <= budget.limit) {
      used += cost;
      skillLines.push(rendered);
    } else {
      omittedCount += 1;
    }
  }

  return {
    skillRootLines,
    skillLines,
    totalCount,
    includedCount: skillLines.length,
    omittedCount,
    truncatedDescriptionChars: lines.reduce((sum, line) => sum + [...line.description].length, 0),
    truncatedDescriptionCount: lines.filter((line) => line.description.length > 0).length,
    warningMessage: `Exceeded skills context budget${budget.kind === "tokens" ? " of 2%" : ""}. All skill descriptions were removed and ${omittedCount} additional ${omittedCount === 1 ? "skill was" : "skills were"} not included in the model-visible skills list.`,
  };
}

function renderLinesWithDescriptionBudget(lines: SkillLine[], budget: Budget, limit: number): { text: string; truncatedChars: number }[] {
  const descriptions = lines.map((line) => [...line.description]);
  const allocations = new Array(lines.length).fill(0) as number[];
  let remaining = limit;

  while (remaining > 0) {
    let changed = false;
    for (let index = 0; index < lines.length; index += 1) {
      if (allocations[index] >= descriptions[index].length) {
        continue;
      }

      const currentDescription = descriptions[index].slice(0, allocations[index]).join("");
      const nextDescription = descriptions[index].slice(0, allocations[index] + 1).join("");
      const current = currentDescription
        ? `- ${lines[index].name}: ${currentDescription} (file: ${lines[index].path})`
        : `- ${lines[index].name}: (file: ${lines[index].path})`;
      const next = nextDescription
        ? `- ${lines[index].name}: ${nextDescription} (file: ${lines[index].path})`
        : `- ${lines[index].name}: (file: ${lines[index].path})`;
      const delta = lineCost(budget, next) - lineCost(budget, current);
      if (delta <= remaining) {
        allocations[index] += 1;
        remaining -= delta;
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  return lines.map((line, index) => {
    const description = descriptions[index].slice(0, allocations[index]).join("");
    return {
      text: description
        ? `- ${line.name}: ${description} (file: ${line.path})`
        : `- ${line.name}: (file: ${line.path})`,
      truncatedChars: descriptions[index].length - allocations[index],
    };
  });
}

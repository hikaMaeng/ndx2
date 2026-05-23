import path from "node:path";
import { textCost } from "./budget.js";
import { renderAvailableSkillsBody } from "./templates.js";
import type { Budget, SkillMetadata } from "./types.js";

export function buildAliasPlan(skills: SkillMetadata[]): string[] {
  const roots = [...new Set(skills.map((skill) => skill.root))].sort();
  if (roots.length === 0) {
    return [];
  }

  const fullPathLength = skills.reduce((sum, skill) => sum + skill.pathToSkillMd.length, 0);
  const aliasPathLength = skills.reduce((sum, skill) => {
    const rootIndex = roots.indexOf(skill.root);
    return sum + `r${rootIndex}/${path.posix.relative(skill.root, skill.pathToSkillMd)}`.length;
  }, roots.reduce((sum, root, index) => sum + `- \`r${index}\` = \`${root}\`\n`.length, 0));

  return aliasPathLength < fullPathLength ? roots : [];
}

export function renderAliasedPath(skill: SkillMetadata, roots: string[]): string {
  const index = roots.indexOf(skill.root);
  return index < 0 ? skill.pathToSkillMd : `r${index}/${path.posix.relative(skill.root, skill.pathToSkillMd)}`;
}

export function aliasedMetadataOverheadCost(budget: Budget, roots: string[]): number {
  const rootLines = roots.map((root, index) => `- \`r${index}\` = \`${root}\``);
  return Math.max(0, textCost(budget, renderAvailableSkillsBody(rootLines, [])) - textCost(budget, renderAvailableSkillsBody([], [])));
}

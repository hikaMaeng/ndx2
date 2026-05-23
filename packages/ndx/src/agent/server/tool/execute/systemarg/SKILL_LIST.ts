import type { NDXToolSystemArgHandlerInput } from "./types.js";

export function SKILL_LIST({ turnContext }: NDXToolSystemArgHandlerInput): string {
  const roots = new Map<string, string>();
  const developerText = typeof turnContext.developer.content === "string" ? turnContext.developer.content : JSON.stringify(turnContext.developer.content);
  for (const match of developerText.matchAll(/^- `([^`]+)` = `([^`]+)`$/gm)) {
    if (match[1] && match[2]) {
      roots.set(match[1], match[2]);
    }
  }

  const skills: Array<{ name: string; description: string; path: string }> = [];
  for (const match of developerText.matchAll(/^- ([^:\n]+):\s*(?:(.*?)\s*)?\(file:\s*([^)]+)\)$/gm)) {
    const name = match[1]?.trim() ?? "";
    const path = expandSkillPathAlias(match[3]?.trim() ?? "", roots);
    if (name && path) {
      skills.push({ name, description: match[2]?.trim() ?? "", path });
    }
  }
  return JSON.stringify(skills);
}

function expandSkillPathAlias(skillPath: string, roots: Map<string, string>): string {
  const slashIndex = skillPath.indexOf("/");
  if (slashIndex <= 0) {
    return skillPath;
  }
  const root = roots.get(skillPath.slice(0, slashIndex));
  return root ? `${root.replace(/\/$/, "")}/${skillPath.slice(slashIndex + 1)}` : skillPath;
}

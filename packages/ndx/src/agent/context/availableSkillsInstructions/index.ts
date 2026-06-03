import type { SessionMetadata } from "../types.js";
import { defaultSkillMetadataBudget } from "./budget.js";
import { loadSkills } from "./loader.js";
import { buildAvailableSkills } from "./render.js";
import { renderAvailableSkillsBody } from "./templates.js";

export async function buildAvailableSkillsInstructions(
  sessionMetadata: Pick<SessionMetadata, "userHome" | "projectHome" | "cwd" | "model"> = {
    cwd: process.cwd(),
    model: { type: "openai", model: "", url: "", token: "", contextsize: 0 },
  },
): Promise<string> {
  const loaded = await loadSkills(sessionMetadata);
  const available = buildAvailableSkills(loaded, defaultSkillMetadataBudget(sessionMetadata.model.contextsize));
  if (!available) {
    return "";
  }

  return renderAvailableSkillsBody(available.skillRootLines, available.skillLines, available.warningMessage);
}

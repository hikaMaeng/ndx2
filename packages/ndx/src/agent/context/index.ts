import { buildAvailablePluginsInstructions } from "./availablePluginsInstructions/index.js";
import { buildAvailableSkillsInstructions } from "./availableSkillsInstructions/index.js";
import { buildDeveloperInstructions } from "./developerInstructions/index.js";
import { buildEnvironmentContext } from "./environmentContext/index.js";
import { resolveModelInstruction } from "./modelInstrcution/index.js";
import { buildReasoningDisciplineInstructions } from "./reasoningDiscipline/index.js";
import type { BuiltContext, BuiltContextParts, SessionMetadata } from "./types.js";
import { buildUserInstructions } from "./userInstructions/index.js";

export { resolveModelInstruction } from "./modelInstrcution/index.js";
export { loadSkills } from "./availableSkillsInstructions/loader.js";
export type { BuiltContext, BuiltContextParts, SessionMetadata } from "./types.js";
export type { SkillMetadata, SkillScope } from "./availableSkillsInstructions/types.js";

/** Builds the consolidated developer and user context strings for a session turn. */
export async function buildContext(sessionMetadata: SessionMetadata): Promise<BuiltContext> {
  const parts = await buildContextParts(sessionMetadata);
  return {
    developer: parts.developer,
    user: [parts.userInstructions, parts.environment].filter((section) => section.length > 0).join("\n\n"),
  };
}

export async function buildContextParts(sessionMetadata: SessionMetadata): Promise<BuiltContextParts> {
  const modelInstruction = (await resolveModelInstruction(
    sessionMetadata.model.model,
    sessionMetadata.userHome
  )).trim();
  const availableSkills = (await buildAvailableSkillsInstructions(sessionMetadata)).trim();
  const availablePlugins = (await buildAvailablePluginsInstructions()).trim();

  const developerSections = [
    modelInstruction ? `<model_instruction>\n${modelInstruction}\n</model_instruction>` : "",
    `<reasoning_discipline>\n${buildReasoningDisciplineInstructions()}\n</reasoning_discipline>`,
    await buildDeveloperInstructions(sessionMetadata),
    availableSkills ? `<available_skills_instructions>\n${availableSkills}\n</available_skills_instructions>` : "",
    availablePlugins ? `<available_plugins_instructions>${availablePlugins}</available_plugins_instructions>` : "",
  ];
  return {
    developer: developerSections.filter((section) => section.length > 0).join("\n\n"),
    userInstructions: (await buildUserInstructions(sessionMetadata)).filter((section) => section.length > 0).join("\n\n"),
    environment: buildEnvironmentContext(sessionMetadata),
  };
}

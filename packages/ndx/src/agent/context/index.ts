import { buildAppsInstructions } from "./appsInstructions/index.js";
import { buildAvailablePluginsInstructions } from "./availablePluginsInstructions/index.js";
import { buildAvailableSkillsInstructions } from "./availableSkillsInstructions/index.js";
import { buildCollaborationModeInstructions } from "./collaborationModeInstructions/index.js";
import { buildCommitAttributionInstruction } from "./commitAttributionInstruction/index.js";
import { buildDeveloperInstructions } from "./developerInstructions/index.js";
import { buildEnvironmentContext } from "./environmentContext/index.js";
import { buildMemoryToolInstructions } from "./memoryToolInstructions/index.js";
import { resolveModelInstruction } from "./modelInstrcution/index.js";
import { buildPermissionInstructions } from "./permission/index.js";
import { buildPersonalitySpecInstructions } from "./personalitySpecInstructions/index.js";
import { buildRealtimeUpdate } from "./realtimeUpdate/index.js";
import type { BuiltContext, BuiltContextParts, SessionMetadata } from "./types.js";
import { buildUserInstructions } from "./userInstructions/index.js";

export { resolveModelInstruction } from "./modelInstrcution/index.js";
export type { BuiltContext, BuiltContextParts, SessionMetadata } from "./types.js";

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
  const permissions = (await buildPermissionInstructions()).trim();
  const memoryTool = (await buildMemoryToolInstructions()).trim();
  const collaborationMode = (await buildCollaborationModeInstructions()).trim();
  const realtimeUpdate = (await buildRealtimeUpdate()).trim();
  const personalitySpec = (await buildPersonalitySpecInstructions()).trim();
  const apps = (await buildAppsInstructions()).trim();
  const availableSkills = (await buildAvailableSkillsInstructions(sessionMetadata)).trim();
  const availablePlugins = (await buildAvailablePluginsInstructions()).trim();
  const commitAttribution = (await buildCommitAttributionInstruction()).trim();

  const developerSections = [
    modelInstruction ? `<model_instruction>\n${modelInstruction}\n</model_instruction>` : "",
    permissions ? `<permissions instructions>${permissions}</permissions instructions>` : "",
    await buildDeveloperInstructions(sessionMetadata),
    memoryTool ? `<memory_tool_instructions>${memoryTool}</memory_tool_instructions>` : "",
    collaborationMode ? `<collaboration_mode>${collaborationMode}</collaboration_mode>` : "",
    realtimeUpdate ? `<realtime_update>${realtimeUpdate}</realtime_update>` : "",
    personalitySpec ? `<personality_spec_instructions>${personalitySpec}</personality_spec_instructions>` : "",
    apps ? `<apps_instructions>${apps}</apps_instructions>` : "",
    availableSkills ? `<available_skills_instructions>\n${availableSkills}\n</available_skills_instructions>` : "",
    availablePlugins ? `<available_plugins_instructions>${availablePlugins}</available_plugins_instructions>` : "",
    commitAttribution ? `<commit_attribution_instruction>${commitAttribution}</commit_attribution_instruction>` : "",
  ];
  return {
    developer: developerSections.filter((section) => section.length > 0).join("\n\n"),
    userInstructions: (await buildUserInstructions(sessionMetadata)).filter((section) => section.length > 0).join("\n\n"),
    environment: buildEnvironmentContext(sessionMetadata),
  };
}

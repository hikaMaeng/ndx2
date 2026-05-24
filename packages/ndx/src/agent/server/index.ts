export const agentServerDomain = Object.freeze({
  surface: "agent",
  runtime: "server"
});

export { buildContext, resolveModelInstruction } from "./context/index.js";
export type { BuiltContext, SessionMetadata } from "./context/index.js";
export { loadSkills } from "./context/availableSkillsInstructions/loader.js";
export type { SkillMetadata, SkillScope } from "./context/availableSkillsInstructions/types.js";
export { calculateContextUsage, calculateDetailedContextUsage, estimateContextTokens } from "./contextusage/index.js";
export type { NDXContextUsage } from "./contextusage/index.js";
export { initServer } from "./init/index.js";
export type { InitializedServerResult, InitServerOptions, InitServerResult, NDXDatabase } from "./init/index.js";
export {
  DEFAULT_NDX_USERID,
  DEFAULT_USER_RECORD_SQL,
  USERS_TABLE_SQL,
  createUser,
  getUser,
  initAccountDatabase,
  listUser
} from "./account/index.js";
export type { NDXUserRow } from "./account/index.js";
export {
  createSettingsWebModel,
  createSettingsWebProvider,
  deleteSettingsWebModel,
  deleteSettingsWebProvider,
  getSettingsWebProvider,
  listSettingsWebModel,
  listSettingsWebProvider,
  providerModelEndpointCandidates,
  syncSettingsWebProviderModels,
  updateSettingsWebModel,
  updateSettingsWebProvider
} from "./web-model/index.js";
export type { NDXWebModelRow, NDXWebProviderRow } from "./web-model/index.js";
export {
  PROJECT_TABLE_INDEX_SQL,
  PROJECT_TABLE_SQL,
  ensureProject,
  getProjectById,
  initProjectDatabase,
  normalizeProjectTarget
} from "./project/index.js";
export type { NDXProjectInput, NDXProjectRow, NDXProjectTarget } from "./project/index.js";
export {
  SESSION_TABLE_INDEX_SQL,
  SESSION_TABLE_SQL,
  SESSIONDATA_TABLE_INDEX_SQL,
  SESSIONDATA_TABLE_SQL,
  addInlineAttachmentDataIds,
  appendSessionData,
  assertModelSupportsAttachments,
  assistantDeltaContents,
  assistantMessageContents,
  createSession,
  consumeInlineAttachmentDataIds,
  deleteSession,
  errorContents,
  getSession,
  initSessionDatabase,
  interruptContents,
  listInlineAttachmentDataIds,
  listSession,
  listSessionData,
  pruneProjectPathMismatchedSession,
  completeSessionInterrupt,
  requestSessionInterrupt,
  runSessionTurn,
  sessionDataText,
  sessionDataRowsToModelMessages,
  toolCallContents,
  userMessageContents,
  updateSessionEndTurn,
  updateSessionStartTurn,
  updateSessionTitle,
  writeSessionAttachments
} from "./session/index.js";
export type { NDXSessionDataContents, NDXSessionInputAttachmentData } from "./session/index.js";
export { buildTurnMessages, buildTurnMessageParts, getRuntimeTurnPhase, requestRuntimeTurnInterrupt, runAgentTurn, turnInterruptPolicy } from "./turnloop/index.js";
export type { NDXTurnInput, NDXTurnMessageParts } from "./turnloop/index.js";
export type { NDXTurnInterruptAction, NDXTurnPhase } from "./turnloop/index.js";
export { DEFAULT_NDX_MAX_MODEL_ITERATIONS, readAgentRuntimeSettings } from "./runtime-settings/index.js";
export type { NDXAgentRuntimeSettings } from "./runtime-settings/index.js";
export { createNDXHookPlan, createNDXHookRuntime, loadNDXHookPlan, loadNDXHookRuntime, logNDXHookRunResult, mergeNDXHookEffects, registerNDXHook, runNDXHooks } from "./hook/index.js";
export type { NDXHookCodeExecutor, NDXHookContext, NDXHookEffect, NDXHookEffectType, NDXHookEventName, NDXHookExecution, NDXHookExecutor, NDXHookPlan, NDXHookProcessDefinition, NDXHookProcessExecutor, NDXHookRunResult, NDXHookRuntime, NDXHookRuntimeOptions, NDXHookSource } from "./hook/index.js";
export { executeToolCalls, listAvailableTools, toolSchemas } from "./tool/index.js";
export type { NDXResolvedTool, NDXToolExecutionOptions, NDXToolExecutionResult, NDXToolRegistryOptions } from "./tool/index.js";
export type {
  NDXModelMessage,
  NDXModelConfig,
  NDXSessionCreateInput,
  NDXSessionDataRow,
  NDXSessionMode,
  NDXSessionRow
} from "./session/index.js";
export {
  SESSIONTOKEN_TABLE_INDEX_SQL,
  SESSIONTOKEN_TABLE_SQL,
  SESSION_TOKEN_MAX_AGE_DAYS,
  createSessionToken,
  getSessionTokenGrant,
  initSessionTokenDatabase,
  pruneExpiredSessionTokens
} from "./session-token/index.js";
export type { NDXSessionTokenGrant, NDXSessionTokenRow } from "./session-token/index.js";

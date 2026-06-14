import { assistantMessageContents, userMessageContents } from "../../session/content.js";
import { appendSessionData } from "../../session/appendSessionData.js";
import { listSessionDataForModelContext } from "../../compact/index.js";
import { addInlineAttachmentDataIds, listInlineAttachmentDataIds } from "../../session/runtimeData.js";
import { updateSessionEndTurn, updateSessionStartTurn } from "../../session/updateSession.js";
import { calculateDetailedContextUsage } from "../../contextusage/index.js";
import { readSessionModelRequestPrefixPreview } from "../../hook/base/prefixDrift/index.js";
import { loadNDXHookRuntime } from "../../hook/index.js";
import { runTurnRequestReceivedHook } from "../../hook/turn.request.received/index.js";
import { readAgentRuntimeSettings } from "../../runtime-settings/index.js";
import { listAvailableTools, toolSchemas } from "../../tool/index.js";
import { serverContainerUserHome, toServerProjectPath } from "../../../common/server-path/index.js";
import { createNDXAgentResourceResolver, DEFAULT_NDX_AGENT_LANGUAGE, NDX_AGENT_RESOURCE } from "../../../common/resource/index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import { beginTurnInterruptScope } from "../base/interrupt/index.js";
import { buildTurnBaseMessageParts, buildTurnMessagesFromParts } from "../base/context/index.js";
import { compactTurnContext } from "../base/compact/index.js";
import { createCotWorkTimingTracker } from "../../tool/base/cot_work/timing.js";
import { attachContextUsageMeasurement, runTurnEndForState } from "../base/state/index.js";
import { handleTurnFailure } from "../base/failure/index.js";
import { prepareBeforeLoop } from "../before-loop/index.js";
import { prepareTurnIteration } from "../iteration/index.js";
import { callTurnModel } from "../model-call/index.js";
import { handleModelResponse } from "../model-response/index.js";
import { processToolCalls } from "../tool-call/index.js";
import { finishAfterLoop, finishCompactTurn } from "../after-loop/index.js";
import type { NDXDatabase, NDXModelConfig, NDXSessionRow } from "../../session/types.js";
import type { NDXActiveTurnPipelineState, NDXTurnInput, NDXTurnLoopEvents, NDXTurnPipelineState } from "../types.js";

export async function handleUserRequest(
  database: NDXDatabase,
  session: NDXSessionRow,
  request: NDXTurnInput,
  model?: NDXModelConfig,
  events: NDXTurnLoopEvents = {}
): Promise<void> {
  const state: NDXTurnPipelineState = {
    database,
    sourceSession: session,
    request,
    model,
    events,
    pipeline: {
      prepareBeforeLoop,
      prepareTurnIteration,
      callTurnModel,
      handleModelResponse,
      processToolCalls,
      finishAfterLoop,
      finishCompactTurn,
      handleTurnFailure
    },
    requestText: request.text,
    attachments: request.attachments ?? [],
    assistantText: "",
    activeIteration: 0,
    finalIteration: 1,
    messages: [],
    availableTools: [],
    modelTools: []
  };

  try {
    state.runningSession = await updateSessionStartTurn(database, session.sessionid, model);
    state.lastModelRequestStablePrefix = readSessionModelRequestPrefixPreview(state.runningSession.sessionid);
    state.language = events.language ?? DEFAULT_NDX_AGENT_LANGUAGE;
    state.resource = events.resource ?? createNDXAgentResourceResolver();
    state.t = (key, values) => state.resource?.(key, { language: state.language ?? DEFAULT_NDX_AGENT_LANGUAGE, values }) ?? String(key);
    state.interrupt = beginTurnInterruptScope(database, state.runningSession.sessionid);
    state.projectHome = toServerProjectPath(state.runningSession.path);
    state.userHome = serverContainerUserHome();
    state.runtimeSettings = await readAgentRuntimeSettings(state.userHome);
    state.hookRuntime = events.hooks ?? await loadNDXHookRuntime({ userHome: state.userHome, projectHome: state.projectHome });
    state.messageParts = await buildTurnBaseMessageParts(state.runningSession);
    state.availableTools = await listAvailableTools({ userHome: state.userHome, projectHome: state.projectHome });
    state.modelTools = toolSchemas(state.availableTools);

    const preInputRows = await listSessionDataForModelContext(database, state.runningSession.sessionid);
    const preInputMessages = buildTurnMessagesFromParts({
      ...state.messageParts,
      historyRows: preInputRows,
      inlineAttachmentDataIds: await listInlineAttachmentDataIds(database, state.runningSession.sessionid)
    });
    state.messages = preInputMessages;
    const preInputContextUsage = calculateDetailedContextUsage(preInputMessages, state.runningSession.model.contextsize, state.requestText, state.modelTools, state.lastModelRequestStablePrefix);
    const requestReceived = await runTurnRequestReceivedHook(state.hookRuntime, {
      database,
      session: state.runningSession,
      requestText: state.requestText,
      userHome: state.userHome,
      projectHome: state.projectHome,
      messages: preInputMessages,
      previousModelRequestStablePrefix: state.lastModelRequestStablePrefix,
      sessionDataRows: preInputRows,
      availableTools: state.availableTools,
      modelTools: state.modelTools,
      contextUsage: preInputContextUsage
    });
    state.text = requestReceived.requestText;
    if (!requestReceived.stopTurn && requestReceived.compact) {
      await compactTurnContext(state, requestReceived.compact, preInputRows, preInputContextUsage, state.text);
    }

    state.input = await appendSessionData(database, state.runningSession.sessionid, "user", userMessageContents(state.text, state.attachments));
    if (state.attachments.some((attachment) => attachment.kind === "image")) {
      await addInlineAttachmentDataIds(database, state.runningSession.sessionid, [state.input.dataid]);
    }
    state.cotWorkTiming = createCotWorkTimingTracker();
    const activeState = state as NDXActiveTurnPipelineState;
    attachContextUsageMeasurement(activeState);

    if (requestReceived.stopTurn) {
      const assistantText = requestReceived.finalAssistantText ?? activeState.t(NDX_AGENT_RESOURCE.TURN_HOOK_REQUEST_RECEIVED_STOPPED_MESSAGE);
      const assistant = await appendSessionData(database, activeState.runningSession.sessionid, "assistant", assistantMessageContents(assistantText));
      const contextUsage = calculateDetailedContextUsage([], activeState.runningSession.model.contextsize, assistantText, []);
      await events.onEvent?.({ type: NDX_TURN_EVENT.InputRecorded, input: activeState.input, contextUsage });
      await events.onEvent?.({ type: NDX_TURN_EVENT.AssistantRecorded, iteration: 1, assistant, contextUsage });
      const updatedSession = await updateSessionEndTurn(database, activeState.runningSession.sessionid);
      await events.onEvent?.({ type: NDX_TURN_EVENT.TurnEnd, iteration: 1, session: updatedSession, contextUsage });
      await runTurnEndForState(activeState, assistant, 1, assistantText, contextUsage);
      return;
    }

    await activeState.pipeline.prepareBeforeLoop(activeState);
    return;
  } catch (error) {
    if (state.input) {
      await state.pipeline.handleTurnFailure(state, error);
      return;
    }
    state.interrupt?.complete();
    throw error;
  } finally {
    state.interrupt?.complete();
  }
}

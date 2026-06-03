import { calculateDetailedContextUsage } from "../../../contextusage/index.js";
import { listSessionDataForModelContext } from "../../../compact/index.js";
import { runTurnEndHook } from "../../../hook/turn.end/index.js";
import { listInlineAttachmentDataIds } from "../../../session/runtimeData.js";
import { sessionDataRowsToInlineAttachmentMessages, sessionDataRowsToModelMessages } from "../../../session/sessionDataRowsToModelMessages.js";
import { buildTurnMessagesFromParts } from "../context/index.js";
import type { NDXContextUsage } from "../../../contextusage/index.js";
import type { NDXSessionDataRow } from "../../../session/types.js";
import type { NDXActiveTurnPipelineState, NDXTurnPipelineState } from "../../types.js";

export function requireActiveTurnState(state: NDXTurnPipelineState): asserts state is NDXActiveTurnPipelineState {
  if (
    !state.runningSession ||
    !state.input ||
    !state.text ||
    !state.language ||
    !state.resource ||
    !state.t ||
    !state.userHome ||
    !state.projectHome ||
    !state.runtimeSettings ||
    !state.hookRuntime ||
    !state.interrupt ||
    !state.messageParts ||
    !state.cotWorkTiming ||
    !state.turnContextUsage
  ) {
    throw new Error("turn pipeline state is not active");
  }
}

export async function refreshCurrentMessageParts(state: NDXActiveTurnPipelineState) {
  const historyRows = await listSessionDataForModelContext(state.database, state.runningSession.sessionid, state.runningSession.slidewindow);
  const inlineAttachmentDataIds = await listInlineAttachmentDataIds(state.database, state.runningSession.sessionid);
  state.currentMessageParts = {
    ...state.messageParts,
    historyRows,
    history: sessionDataRowsToModelMessages(historyRows),
    inlineAttachments: sessionDataRowsToInlineAttachmentMessages(historyRows, inlineAttachmentDataIds)
  };
  return state.currentMessageParts;
}

export async function refreshTurnMessages(state: NDXActiveTurnPipelineState) {
  state.messages = buildTurnMessagesFromParts(await refreshCurrentMessageParts(state));
  return state.messages;
}

export function attachContextUsageMeasurement(state: NDXActiveTurnPipelineState): void {
  state.turnContextUsage = (extraContent = "", tools: unknown[] = state.modelTools, inputMessages = state.messages) =>
    calculateDetailedContextUsage(inputMessages, state.runningSession.model.contextsize, extraContent, tools);
}

export async function runTurnEndForState(
  state: NDXActiveTurnPipelineState,
  assistant: NDXSessionDataRow,
  iteration: number,
  assistantText: string,
  contextUsage: NDXContextUsage
): Promise<void> {
  await runTurnEndHook(state.hookRuntime, {
    database: state.database,
    session: state.runningSession,
    input: state.input,
    assistant,
    requestText: state.text,
    userHome: state.userHome,
    projectHome: state.projectHome,
    language: state.language,
    resource: state.resource,
    iteration,
    messages: state.messages,
    availableTools: state.availableTools,
    modelTools: state.modelTools,
    assistantText,
    contextUsage
  });
}

import { compactSessionHistory, listSessionDataForModelContext } from "../../../compact/index.js";
import { estimateContextTokens, calculateDetailedContextUsage } from "../../../contextusage/index.js";
import { listInlineAttachmentDataIds } from "../../../session/runtimeData.js";
import { sessionDataRowsToInlineAttachmentMessages, sessionDataRowsToModelMessages } from "../../../session/sessionDataRowsToModelMessages.js";
import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { buildTurnMessagesFromParts } from "../context/index.js";
import type { NDXContextUsage } from "../../../contextusage/index.js";
import type { NDXHookCompactEffect } from "../../../hook/index.js";
import type { NDXSessionDataRow } from "../../../session/types.js";
import type { NDXTurnPipelineState } from "../../types.js";

export async function compactTurnContext(
  state: NDXTurnPipelineState,
  compactEffect: NDXHookCompactEffect,
  contextRows: NDXSessionDataRow[],
  contextUsage: NDXContextUsage,
  extraContent: string
): Promise<NDXContextUsage> {
  if (!state.runningSession || !state.interrupt || !state.messageParts) {
    throw new Error("turn pipeline state cannot compact before turn setup");
  }
  await state.interrupt.setPhase("compacting");
  const report = compactEffect.report;
  await state.events.onEvent?.({ type: NDX_TURN_EVENT.CompactStarted, report, contextUsage });
  const compact = await compactSessionHistory(state.database, state.runningSession, report, state.model ?? state.runningSession.model, { contextRows });
  const compactRows = await listSessionDataForModelContext(state.database, state.runningSession.sessionid);
  const compactMessages = buildTurnMessagesFromParts({
    ...state.messageParts,
    historyRows: compactRows,
    history: sessionDataRowsToModelMessages(compactRows),
    inlineAttachments: sessionDataRowsToInlineAttachmentMessages(compactRows, await listInlineAttachmentDataIds(state.database, state.runningSession.sessionid))
  });
  const compactContextUsage = calculateDetailedContextUsage(compactMessages, state.runningSession.model.contextsize, extraContent, state.modelTools);
  await state.events.onEvent?.({
    type: NDX_TURN_EVENT.CompactCompleted,
    report,
    compact: compact.row,
    sourceRowCount: compact.sourceRows.length,
    summaryTokens: estimateContextTokens(compact.text),
    contextUsage: compactContextUsage
  });
  return compactContextUsage;
}

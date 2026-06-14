import { finalizeSessionHistoryPolicy } from "./messages/finalizeSessionHistoryPolicy.js";
import { inlineAttachmentProjectionPolicy } from "./messages/inlineAttachmentProjectionPolicy.js";
import { invalidToolFailurePairSuppressPolicy } from "./messages/invalidToolFailurePairSuppressPolicy.js";
import { runtimeControlErrorSuppressPolicy } from "./messages/runtimeControlErrorSuppressPolicy.js";
import { sessionHistoryProjectionPolicy } from "./messages/sessionHistoryProjectionPolicy.js";
import { staleCotWorkReminderSuppressPolicy } from "./messages/staleCotWorkReminderSuppressPolicy.js";
import { assistantMessageProjection, assistantReasoningHideProjection, assistantToolDeltaHideProjection } from "./rows/assistant.js";
import { compactSummaryProjection } from "./rows/compact.js";
import { cotWorkPayloadHideProjection, cotWorkReminderProjection } from "./rows/cotWork.js";
import { legacyTextRowProjection } from "./rows/legacyText.js";
import { skillContextProjection } from "./rows/skillContext.js";
import { toolCallProjection, toolResultProjection } from "./rows/toolCalls.js";
import { userMessageProjection } from "./rows/userMessages.js";
import type { NDXFinalMessageParts, NDXFinalMessagePipelineContext, NDXFinalMessagePolicy } from "./messages/types.js";
import type { NDXFinalRowProjectionPolicy } from "./rows/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

const sessionRowProjectionPolicies: NDXFinalRowProjectionPolicy[] = [
  { name: "legacy text row projection", project: legacyTextRowProjection },
  { name: "skill context projection", project: skillContextProjection },
  { name: "user message projection", project: userMessageProjection },
  { name: "tool call projection", project: toolCallProjection },
  { name: "tool result projection", project: toolResultProjection },
  { name: "cot_work reminder projection", project: cotWorkReminderProjection },
  { name: "compact summary projection", project: compactSummaryProjection },
  { name: "cot_work payload hide", project: cotWorkPayloadHideProjection },
  { name: "assistant tool delta hide", project: assistantToolDeltaHideProjection },
  { name: "assistant reasoning hide", project: assistantReasoningHideProjection },
  { name: "assistant message projection", project: assistantMessageProjection }
];

const finalMessagePolicies: NDXFinalMessagePolicy[] = [
  { name: "session history projection", apply: sessionHistoryProjectionPolicy },
  { name: "stale cot_work_reminder suppress", apply: staleCotWorkReminderSuppressPolicy },
  { name: "runtime-control error suppress", apply: runtimeControlErrorSuppressPolicy },
  { name: "invalid tool failure pair suppress", apply: invalidToolFailurePairSuppressPolicy },
  { name: "finalize session history", apply: finalizeSessionHistoryPolicy },
  { name: "inline attachment projection", apply: inlineAttachmentProjectionPolicy }
];

export function prepareFinalModelRequestMessagesForCall(input: {
  messages?: ResponseInputItem[];
  parts?: NDXFinalMessageParts;
  omitBaseMessages?: boolean;
  finalizingAfterIterationLimit?: boolean;
  iterationLimitMessage?: string;
}): ResponseInputItem[] {
  const messages = input.messages ?? [];
  const output = input.parts
    ? [
        ...(input.omitBaseMessages ? [] : [input.parts.developer, input.parts.user]),
        ...messages
      ]
    : [...messages];

  if (input.parts?.historyRows) {
    let context: NDXFinalMessagePipelineContext = {
      rows: input.parts.historyRows,
      inlineAttachmentDataIds: new Set([...(input.parts.inlineAttachmentDataIds ?? [])].map(String)),
      rowProjectionPolicies: sessionRowProjectionPolicies,
      rowStates: [],
      historyMessages: [],
      inlineAttachmentMessages: [],
      diagnostics: []
    };
    for (const policy of finalMessagePolicies) {
      context = policy.apply(context);
    }
    output.push(...context.historyMessages, ...context.inlineAttachmentMessages);
  } else if (input.parts) {
    output.push(...(input.parts.history ?? []), ...(input.parts.inlineAttachments ?? []));
  }

  const withOneShotMessages = input.finalizingAfterIterationLimit && input.iterationLimitMessage
    ? [...output, { role: "system" as const, content: input.iterationLimitMessage }]
    : output;
  return withOneShotMessages.filter((message) => {
    if (!("content" in message)) {
      return true;
    }
    return typeof message.content === "string" ? message.content.trim().length > 0 : Array.isArray(message.content) ? message.content.length > 0 : true;
  });
}

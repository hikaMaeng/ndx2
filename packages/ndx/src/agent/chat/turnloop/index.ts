import { requestModelResponse, responseToolCallId, type ResponseInputItem, type ResponseStreamInterrupt } from "ndx/common/responseapi";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import { serverContainerUserHome } from "../../../common/server-path/index.js";
import { calculateDetailedContextUsage } from "../../contextusage/index.js";
import { assistantDeltaContents, assistantMessageContents, assistantReasoningContents, errorContents, toolCallContents, toolResultContents, userMessageContents } from "../../session/content.js";
import type { NDXToolResultContents } from "../../session/index.js";
import { createCotWorkAgentCallHandler, NDX_COT_WORK_AGENTCALL_NAME } from "../../tool/base/cot_work/agentCall.js";
import { executeToolCalls, listAvailableTools, summarizeToolName, toolSchemas } from "../../tool/index.js";
import { createCotWorkTimingTracker } from "../../turnloop/cotWorkTiming.js";
import type { NDXTurnInput, NDXTurnLoopEvents } from "../../turnloop/index.js";
import { NDX_CHAT_ALLOWED_TOOL_NAMES } from "../tool/policy.js";
import { buildChatTurnBaseMessageParts, buildChatTurnMessagesFromParts, chatSessionDataRowsToModelMessages, chatSessionDataRowsToSessionDataRows } from "../context/index.js";
import { appendChatSessionData, listChatSessionData, updateChatSessionEndTurn, updateChatSessionStartTurn } from "../session/index.js";
import type { NDXChatSessionRow, NDXDatabase, NDXModelConfig } from "../types.js";

export async function runChatSessionTurn(
  database: NDXDatabase,
  session: NDXChatSessionRow,
  request: NDXTurnInput,
  model?: NDXModelConfig,
  events: NDXTurnLoopEvents = {}
): Promise<void> {
  const runningSession = await updateChatSessionStartTurn(database, session.chatsessionid, model);
  const input = await appendChatSessionData(database, runningSession.chatsessionid, "user", userMessageContents(request.text.trim(), []));
  const baseParts = buildChatTurnBaseMessageParts(runningSession);
  const userHome = serverContainerUserHome();
  let historyRows = await listChatSessionData(database, runningSession.chatsessionid);
  let messages: ResponseInputItem[] = buildChatTurnMessagesFromParts({
    ...baseParts,
    historyRows,
    history: chatSessionDataRowsToModelMessages(historyRows)
  });
  let availableTools = await listAvailableTools({ userHome, projectHome: userHome, allowedToolNames: NDX_CHAT_ALLOWED_TOOL_NAMES });
  let modelTools = toolSchemas(availableTools);
  const turnContextUsage = (extraContent = "", tools: unknown[] = modelTools, inputMessages: ResponseInputItem[] = messages) =>
    calculateDetailedContextUsage(inputMessages, runningSession.model.contextsize, extraContent, tools);
  await events.onEvent?.({ type: NDX_TURN_EVENT.InputRecorded, input: { ...input, sessionid: input.chatsessionid }, contextUsage: turnContextUsage() } as never);

  let assistantText = "";
  let finalIteration = 1;
  const cotWorkTiming = createCotWorkTimingTracker();

  try {
    for (let iteration = 1; iteration <= 12; iteration += 1) {
      historyRows = await listChatSessionData(database, runningSession.chatsessionid);
      const messageParts = {
        ...baseParts,
        historyRows,
        history: chatSessionDataRowsToModelMessages(historyRows)
      };
      const turnContext = { ...messageParts, historyRows: chatSessionDataRowsToSessionDataRows(historyRows) };
      messages = buildChatTurnMessagesFromParts(messageParts);
      const contextUsage = turnContextUsage();
      await events.onEvent?.({ type: NDX_TURN_EVENT.ModelRequest, iteration, messages, contextUsage });
      const modelResponseStartedAt = Date.now();
      let modelResponseSequence = 0;
      const response = await requestModelResponse(runningSession.model, messages, modelTools, {
        onText: async (delta, content) => {
          await events.onEvent?.({
            type: NDX_TURN_EVENT.AssistantDelta,
            iteration,
            delta,
            content,
            contextUsage: turnContextUsage(content)
          });
        },
        onReasoning: async (summary, content, stopModelResponse: ResponseStreamInterrupt) => {
          void stopModelResponse;
          await appendChatSessionData(database, runningSession.chatsessionid, "assistant", assistantReasoningContents(iteration, summary));
          modelResponseSequence += 1;
          await events.onEvent?.({
            type: NDX_TURN_EVENT.AssistantReasoning,
            iteration,
            summary,
            contextUsage: turnContextUsage(content)
          });
          void modelResponseStartedAt;
          void modelResponseSequence;
        }
      });
      finalIteration = iteration;
      if (response.toolCalls.length === 0) {
        assistantText = response.content;
        break;
      }
      if (response.content.trim()) {
        await appendChatSessionData(database, runningSession.chatsessionid, "assistant", assistantDeltaContents(iteration, response.content, response.content));
      }
      for (const toolCall of response.toolCalls) {
        const data = await appendChatSessionData(database, runningSession.chatsessionid, "tool_call", toolCallContents(iteration, [toolCall]));
        await events.onEvent?.({
          type: NDX_TURN_EVENT.ToolCallRecorded,
          iteration,
          data: { ...data, sessionid: data.chatsessionid },
          toolCall,
          contextUsage: turnContextUsage()
        } as never);
      }
      await events.onEvent?.({ type: NDX_TURN_EVENT.ToolBatchStarted, iteration, toolCalls: response.toolCalls, contextUsage: turnContextUsage() });
      const executedToolCalls = await executeToolCalls(response.toolCalls, {
        cwd: userHome,
        userHome,
        projectHome: userHome,
        sessionid: runningSession.chatsessionid,
        turnContext,
        allowedToolNames: NDX_CHAT_ALLOWED_TOOL_NAMES,
        denyToolResultEffects: true,
        observer: {
          async onToolStarted(event) {
            await events.onEvent?.({ type: NDX_TURN_EVENT.ToolProgress, status: "started", iteration, tool: event.tool, callId: event.callId, args: event.args, startedAt: event.startedAt, contextUsage: turnContextUsage() });
          },
          async onToolProgress(event) {
            await events.onEvent?.({ type: NDX_TURN_EVENT.ToolProgress, status: "progress", iteration, tool: event.tool, callId: event.callId, event: event.event, receivedAt: event.receivedAt, contextUsage: turnContextUsage() });
          },
          async onToolFinished(result) {
            await events.onEvent?.({ type: NDX_TURN_EVENT.ToolProgress, status: "finished", iteration, result, contextUsage: turnContextUsage(result.output) });
          }
        },
        agentCallHandlers: {
          [NDX_COT_WORK_AGENTCALL_NAME]: createCotWorkAgentCallHandler(async (contents, context) => {
            const timedContents = cotWorkTiming.update(contents);
            await appendChatSessionData(database, runningSession.chatsessionid, "assistant", timedContents);
            await events.onEvent?.({
              type: NDX_TURN_EVENT.CotWork,
              iteration,
              tool: context.tool,
              callId: context.callId,
              contents: timedContents,
              contextUsage: turnContextUsage()
            });
          })
        }
      });
      const toolResults: NDXToolResultContents[] = response.toolCalls.map((toolCall, index) => {
        const executed = executedToolCalls[index] ?? { tool: summarizeToolName(toolCall), success: false, output: "Tool call did not return a result." };
        return {
          toolCallId: responseToolCallId(toolCall) || "tool_call",
          tool: summarizeToolName(toolCall),
          success: executed.success,
          output: executed.output
        };
      });
      const toolResult = await appendChatSessionData(database, runningSession.chatsessionid, "assistant", toolResultContents(iteration, toolResults));
      await events.onEvent?.({
        type: NDX_TURN_EVENT.ToolResultRecorded,
        iteration,
        data: { ...toolResult, sessionid: toolResult.chatsessionid },
        results: executedToolCalls,
        contextUsage: turnContextUsage(toolResults.map((result) => result.output).join("\n\n"))
      } as never);
    }

    const assistant = await appendChatSessionData(database, runningSession.chatsessionid, "assistant", assistantMessageContents(assistantText.trim() || "응답이 비어 있습니다."));
    const finalContextUsage = turnContextUsage(assistantText);
    const finalCotWork = cotWorkTiming.complete();
    if (finalCotWork) {
      await appendChatSessionData(database, runningSession.chatsessionid, "assistant", finalCotWork);
      await events.onEvent?.({ type: NDX_TURN_EVENT.CotWork, iteration: finalIteration, tool: "cot_work", contents: finalCotWork, contextUsage: finalContextUsage });
    }
    await events.onEvent?.({ type: NDX_TURN_EVENT.AssistantRecorded, iteration: finalIteration, assistant: { ...assistant, sessionid: assistant.chatsessionid }, contextUsage: finalContextUsage } as never);
    await updateChatSessionEndTurn(database, runningSession.chatsessionid);
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    const assistant = await appendChatSessionData(database, runningSession.chatsessionid, "assistant", errorContents(errorText));
    await events.onEvent?.({ type: NDX_TURN_EVENT.AssistantRecorded, iteration: finalIteration, assistant: { ...assistant, sessionid: assistant.chatsessionid }, contextUsage: turnContextUsage(errorText) } as never);
    await updateChatSessionEndTurn(database, runningSession.chatsessionid);
    throw error;
  }
}

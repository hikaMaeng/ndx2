import { assistantDeltaContents, assistantMessageContents, errorContents, toolCallContents, toolResultContents, userMessageContents } from "../session/content.js";
import { assertModelSupportsAttachments, writeSessionAttachments } from "../session/attachments.js";
import { appendSessionData } from "../session/appendSessionData.js";
import { updateSessionEndTurn, updateSessionStartTurn } from "../session/updateSession.js";
import { completeSessionInterrupt } from "../session/interruptSession.js";
import { calculateDetailedContextUsage } from "../contextusage/index.js";
import { createCotWorkTimingTracker } from "./cotWorkTiming.js";
import { buildTurnMessageParts as buildTurnMessagePartsForRun } from "./messages.js";
import { buildResponsesToolContinuationInput, requestModelResponse, responseToolCallId, type ModelResponse, type ResponseInputItem, type ResponseStreamInterrupt, type ResponseToolOutput } from "ndx/common/responseapi";
import { NDX_TURN_EVENT } from "../../common/protocol/index.js";
import { createNDXAgentResourceResolver, DEFAULT_NDX_AGENT_LANGUAGE, NDX_AGENT_RESOURCE } from "../../common/resource/index.js";
import { executeToolCalls, listAvailableTools, summarizeToolName, toolSchemas } from "../tool/index.js";
import { createCotWorkAgentCallHandler, NDX_COT_WORK_AGENTCALL_NAME } from "../tool/execute/agentcall/index.js";
import { serverContainerUserHome, toServerProjectPath } from "../../../server/common/index.js";
import { beginTurnInterruptScope, isTurnInterruptedError } from "./interrupt.js";
import { loadNDXHookRuntime } from "../hook/index.js";
import { runResponsePreparedHook } from "../hook/turn.response.prepared/index.js";
import { runTurnContextPreparedHook } from "../hook/turn.context.prepared/index.js";
import { runTurnRequestReceivedHook } from "../hook/turn.request.received/index.js";
import { runToolCalledHook } from "../hook/turn.tool.called/index.js";
import { runModelRespondingHook } from "../hook/turn.model.responding/index.js";
import { runToolResultsCollectedHook } from "../hook/turn.tool.results.collected/index.js";
import { readAgentRuntimeSettings } from "../runtime-settings/index.js";
import type { NDXDatabase, NDXModelConfig, NDXSessionRow } from "../session/types.js";
import type { NDXToolResultContents } from "../session/index.js";
import { type NDXTurnLoopEvents } from "./types.js";

export async function runAgentTurn(
  database: NDXDatabase,
  session: NDXSessionRow,
  requestText: string,
  model?: NDXModelConfig,
  events: NDXTurnLoopEvents = {}
): Promise<void> {
  const runningSession = await updateSessionStartTurn(database, session.sessionid, model);
  const language = events.language ?? DEFAULT_NDX_AGENT_LANGUAGE;
  const resource = events.resource ?? createNDXAgentResourceResolver();
  const t = (key: Parameters<typeof resource>[0], values?: Record<string, string | number>) => resource(key, { language, values });
  const interrupt = beginTurnInterruptScope(database, runningSession.sessionid);
  const projectHome = toServerProjectPath(runningSession.path);
  const userHome = serverContainerUserHome();
  const runtimeSettings = await readAgentRuntimeSettings(userHome);
  const hookRuntime = events.hooks ?? await loadNDXHookRuntime({ userHome, projectHome });
  const requestReceived = await runTurnRequestReceivedHook(hookRuntime, {
    database,
    session: runningSession,
    requestText,
    userHome,
    projectHome
  });
  const text = requestReceived.requestText;
  assertModelSupportsAttachments(runningSession.model, events.attachments);
  const attachments = await writeSessionAttachments(projectHome, runningSession.sessionid, events.attachments);
  let input = await appendSessionData(database, runningSession.sessionid, "user", userMessageContents(text, attachments));
  if (requestReceived.stopTurn) {
    const assistantText = requestReceived.finalAssistantText ?? t(NDX_AGENT_RESOURCE.TURN_HOOK_REQUEST_RECEIVED_STOPPED_MESSAGE);
    const assistant = await appendSessionData(database, runningSession.sessionid, "assistant", assistantMessageContents(assistantText));
    const updatedSession = await updateSessionEndTurn(database, runningSession.sessionid);
    const contextUsage = calculateDetailedContextUsage([], runningSession.model.contextsize, assistantText, []);
    await events.onEvent?.({ type: NDX_TURN_EVENT.InputRecorded, input, contextUsage });
    await events.onEvent?.({ type: NDX_TURN_EVENT.AssistantRecorded, iteration: 1, assistant, contextUsage });
    interrupt.complete();
    void updatedSession;
    return;
  }
  const messageParts = await buildTurnMessagePartsForRun(database, runningSession);
  let messages: ResponseInputItem[] = [messageParts.developer, messageParts.user, ...messageParts.history].filter((message) => typeof message.content === "string" ? message.content.trim().length > 0 : message.content.length > 0);
  let availableTools = await listAvailableTools({ userHome, projectHome });
  let modelTools: Record<string, unknown>[] = toolSchemas(availableTools);
  const turnContextUsage = (extraContent = "", tools: unknown[] = modelTools, inputMessages: ResponseInputItem[] = messages) => calculateDetailedContextUsage(inputMessages, runningSession.model.contextsize, extraContent, tools);
  let inputContextUsage = turnContextUsage();

  let assistantText = "";
  let finalIteration = 1;
  let activeIteration = 0;
  const cotWorkTiming = createCotWorkTimingTracker();
  const processModelRespondingHook = async (
    iteration: number,
    modelResponse: Parameters<typeof runModelRespondingHook>[1]["modelResponse"],
    stopModelResponse: ResponseStreamInterrupt
  ) => {
    const hook = await runModelRespondingHook(hookRuntime, {
      database,
      session: runningSession,
      requestText: text,
      userHome,
      projectHome,
      iteration,
      messages,
      availableTools,
      modelTools,
      modelResponse,
      contextUsage: modelResponse?.type === "reasoning" ? turnContextUsage(modelResponse.content) : modelResponse?.type === "text" ? turnContextUsage(modelResponse.content) : turnContextUsage()
    });
    if (hook.interruptModelResponse) {
      await stopModelResponse(hook.interruptReason);
    }
  };
  try {
    await interrupt.setPhase("context");
    database.logger?.info(NDX_TURN_EVENT.ContextReady, {
      sessionid: runningSession.sessionid,
      messageCount: messages.length,
      contextTokens: inputContextUsage.tokens,
      toolDefinitionTokens: inputContextUsage.toolDefinitionTokens,
      contextsize: inputContextUsage.contextsize
    });
    await events.onEvent?.({ type: NDX_TURN_EVENT.ContextReady, messageCount: messages.length, contextUsage: inputContextUsage });
    await events.onEvent?.({ type: NDX_TURN_EVENT.InputRecorded, input, contextUsage: inputContextUsage });

    let iteration = 1;
    while (true) {
      activeIteration = iteration;
      await interrupt.checkpoint();
      if (iteration > runtimeSettings.maxModelIterations) {
        const finalContextUsage = turnContextUsage("", []);
        await interrupt.setPhase("model_request");
        const contextPreparedHook = await runTurnContextPreparedHook(hookRuntime, {
          database,
          session: runningSession,
          requestText: text,
          userHome,
          projectHome,
          language,
          resource,
          iteration,
          messages,
          availableTools,
          modelTools,
          contextUsage: finalContextUsage
        });
        messages = contextPreparedHook.messages;
        modelTools = contextPreparedHook.modelTools;
        inputContextUsage = turnContextUsage();
        if (contextPreparedHook.stopTurn) {
          assistantText = contextPreparedHook.finalAssistantText ?? t(NDX_AGENT_RESOURCE.TURN_HOOK_CONTEXT_PREPARED_STOPPED_MESSAGE);
          finalIteration = iteration;
          break;
        }
        await events.onEvent?.({ type: NDX_TURN_EVENT.ModelRequest, iteration, messages, contextUsage: finalContextUsage });
        database.logger?.warn(NDX_TURN_EVENT.ModelRequest, {
          sessionid: runningSession.sessionid,
          iteration,
          maxIterations: runtimeSettings.maxModelIterations,
          messageCount: messages.length
        });
        const modelResponseStartedAt = Date.now();
        let modelResponseSequence = 0;
        const response = await requestModelResponse(
          runningSession.model,
          [
            ...messages,
            {
              role: "system",
              content: t(NDX_AGENT_RESOURCE.TURN_ITERATION_LIMIT_SYSTEM_MESSAGE, { maxIterations: runtimeSettings.maxModelIterations })
            }
          ],
          [],
          {
            signal: interrupt.signal,
            onText: async (delta, content, stopModelResponse) => {
              await interrupt.checkpoint();
              await processModelRespondingHook(iteration, {
                type: "text",
                delta,
                content,
                elapsedMs: Date.now() - modelResponseStartedAt,
                sequence: ++modelResponseSequence
              }, stopModelResponse);
              await events.onEvent?.({
                type: NDX_TURN_EVENT.AssistantDelta,
                iteration,
                delta,
                content,
                contextUsage: turnContextUsage(content, [])
              });
            },
            onReasoning: async (summary, content, stopModelResponse) => {
              await interrupt.checkpoint();
              await processModelRespondingHook(iteration, {
                type: "reasoning",
                summary,
                content,
                elapsedMs: Date.now() - modelResponseStartedAt,
                sequence: ++modelResponseSequence
              }, stopModelResponse);
              await events.onEvent?.({
                type: NDX_TURN_EVENT.AssistantReasoning,
                iteration,
                summary,
                contextUsage: turnContextUsage(content, [])
              });
            },
            onDebug: async (event, context) => {
              database.logger?.debug(event, {
                sessionid: runningSession.sessionid,
                iteration,
                finalizingAfterIterationLimit: true,
                ...context
              });
            }
          }
        );
        assistantText = response.content.trim() || t(NDX_AGENT_RESOURCE.TURN_ITERATION_LIMIT_EMPTY_RESPONSE_MESSAGE, { maxIterations: runtimeSettings.maxModelIterations });
        finalIteration = iteration;
        database.logger?.warn(NDX_TURN_EVENT.ModelResponse, {
          sessionid: runningSession.sessionid,
          iteration,
          contentLength: assistantText.length,
          toolCallCount: response.toolCalls.length
        });
        break;
      }

      const contextUsage = turnContextUsage();
      await interrupt.setPhase("model_request");
      const contextPreparedHook = await runTurnContextPreparedHook(hookRuntime, {
        database,
        session: runningSession,
        requestText: text,
        userHome,
        projectHome,
        iteration,
        messages,
        availableTools,
        modelTools,
        contextUsage
      });
      messages = contextPreparedHook.messages;
      modelTools = contextPreparedHook.modelTools;
      inputContextUsage = turnContextUsage();
      if (contextPreparedHook.stopTurn) {
        assistantText = contextPreparedHook.finalAssistantText ?? t(NDX_AGENT_RESOURCE.TURN_HOOK_CONTEXT_PREPARED_STOPPED_MESSAGE);
        finalIteration = iteration;
        break;
      }
      const modelRequestContextUsage = turnContextUsage();
      await events.onEvent?.({ type: NDX_TURN_EVENT.ModelRequest, iteration, messages, contextUsage: modelRequestContextUsage });
      database.logger?.info(NDX_TURN_EVENT.ModelRequest, {
        sessionid: runningSession.sessionid,
        iteration,
        model: runningSession.model.model,
        providerUrl: runningSession.model.url,
        tools: availableTools.map((tool) => ({ name: tool.name, source: tool.source, definitionPath: tool.definitionPath }))
      });

      const modelResponseStartedAt = Date.now();
      let modelResponseSequence = 0;
      const response = await requestModelResponse(
        runningSession.model,
        messages,
        modelTools,
        {
          signal: interrupt.signal,
          onText: async (delta, content, stopModelResponse) => {
            await interrupt.checkpoint();
            await processModelRespondingHook(iteration, {
              type: "text",
              delta,
              content,
              elapsedMs: Date.now() - modelResponseStartedAt,
              sequence: ++modelResponseSequence
            }, stopModelResponse);
            await events.onEvent?.({
              type: NDX_TURN_EVENT.AssistantDelta,
              iteration,
              delta,
              content,
              contextUsage: turnContextUsage(content)
            });
          },
          onReasoning: async (summary, content, stopModelResponse) => {
            await interrupt.checkpoint();
            await processModelRespondingHook(iteration, {
              type: "reasoning",
              summary,
              content,
              elapsedMs: Date.now() - modelResponseStartedAt,
              sequence: ++modelResponseSequence
            }, stopModelResponse);
            await events.onEvent?.({
              type: NDX_TURN_EVENT.AssistantReasoning,
              iteration,
              summary,
              contextUsage: turnContextUsage(content)
            });
          },
          onToolCall: async (toolCall, stopModelResponse) => {
            await interrupt.checkpoint();
            await processModelRespondingHook(iteration, {
              type: "tool_call",
              toolCall,
              elapsedMs: Date.now() - modelResponseStartedAt,
              sequence: ++modelResponseSequence
            }, stopModelResponse);
            database.logger?.debug(NDX_TURN_EVENT.ToolCallRecorded, {
              sessionid: runningSession.sessionid,
              iteration,
              tool: summarizeToolName(toolCall)
            });
          },
          onDebug: async (event, context) => {
            database.logger?.debug(event, {
              sessionid: runningSession.sessionid,
              iteration,
              ...context
            });
          }
        }
      );
      database.logger?.info(NDX_TURN_EVENT.ModelResponse, {
        sessionid: runningSession.sessionid,
        iteration,
        contentLength: response.content.length,
        toolCallCount: response.toolCalls.length,
        outputItemCount: response.outputItems.length
      });
      const responseContent = response.content;
      let toolCalls = response.toolCalls;

      if (toolCalls.length > 0) {
        const toolCalledHook = await runToolCalledHook(hookRuntime, {
          database,
          session: runningSession,
          requestText: text,
          userHome,
          projectHome,
          language,
          resource,
          iteration,
          messages,
          availableTools,
          modelTools,
          assistantText: responseContent,
          toolCalls,
          contextUsage: turnContextUsage(responseContent)
        });
        toolCalls = toolCalledHook.toolCalls;
        if (toolCalledHook.stopTurn) {
          assistantText = toolCalledHook.finalAssistantText ?? (responseContent || t(NDX_AGENT_RESOURCE.TURN_HOOK_TOOL_CALLED_STOPPED_MESSAGE));
          finalIteration = iteration;
          break;
        }
        if (responseContent.trim().length > 0) {
          await appendSessionData(database, runningSession.sessionid, "assistant", assistantDeltaContents(iteration, responseContent, responseContent));
        }
        for (const toolCall of toolCalls) {
          const data = await appendSessionData(database, runningSession.sessionid, "tool_call", toolCallContents(iteration, [toolCall]));
          await events.onEvent?.({
            type: NDX_TURN_EVENT.ToolCallRecorded,
            iteration,
            data,
            toolCall,
            contextUsage: turnContextUsage()
          });
        }
        await interrupt.setPhase("tool_execution");
        const toolContextUsage = turnContextUsage();
        await events.onEvent?.({ type: NDX_TURN_EVENT.ToolBatchStarted, iteration, toolCalls, contextUsage: toolContextUsage });
        database.logger?.info(NDX_TURN_EVENT.ToolCalled, {
          sessionid: runningSession.sessionid,
          iteration,
          count: toolCalls.length,
          tools: toolCalls.map(summarizeToolName)
        });
        let executedToolCalls = await executeToolCalls(toolCalls, {
          cwd: projectHome,
          userHome,
          projectHome,
          sessionid: runningSession.sessionid,
          turnContext: messageParts,
          signal: interrupt.signal,
          observer: {
            async onToolStarted(event) {
              await interrupt.checkpoint();
              await events.onEvent?.({
                type: NDX_TURN_EVENT.ToolProgress,
                status: "started",
                iteration,
                tool: event.tool,
                callId: event.callId,
                args: event.args,
                startedAt: event.startedAt,
                contextUsage: toolContextUsage
              });
              await interrupt.checkpoint();
            },
            async onToolProgress(event) {
              await interrupt.checkpoint();
              await events.onEvent?.({
                type: NDX_TURN_EVENT.ToolProgress,
                status: "progress",
                iteration,
                tool: event.tool,
                callId: event.callId,
                event: event.event,
                receivedAt: event.receivedAt,
                contextUsage: toolContextUsage
              });
              await interrupt.checkpoint();
            },
            async onToolInterrupt(event) {
              await events.onEvent?.({
                type: NDX_TURN_EVENT.ToolProgress,
                iteration,
                tool: event.tool,
                callId: event.callId,
                phase: event.phase,
                status: event.status,
                signal: event.signal,
                receivedAt: event.receivedAt,
                contextUsage: toolContextUsage
              });
              await interrupt.checkpoint();
            },
            async onToolFinished(result) {
              await events.onEvent?.({
                type: NDX_TURN_EVENT.ToolProgress,
                status: "finished",
                iteration,
                result,
                contextUsage: turnContextUsage(result.output)
              });
              await interrupt.checkpoint();
            }
          },
          agentCallHandlers: {
            [NDX_COT_WORK_AGENTCALL_NAME]: createCotWorkAgentCallHandler(async (contents, context) => {
              await interrupt.checkpoint();
              await events.onEvent?.({
                type: NDX_TURN_EVENT.CotWork,
                iteration,
                tool: context.tool,
                callId: context.callId,
                contents: cotWorkTiming.update(contents),
                contextUsage: toolContextUsage
              });
              await interrupt.checkpoint();
            })
          }
        });
        await interrupt.checkpoint();
        const toolCollectedHook = await runToolResultsCollectedHook(hookRuntime, {
          database,
          session: runningSession,
          requestText: text,
          userHome,
          projectHome,
          language,
          resource,
          iteration,
          messages,
          availableTools,
          modelTools,
          toolCalls,
          toolResults: executedToolCalls,
          contextUsage: turnContextUsage(executedToolCalls.map((toolCall) => toolCall.output).join("\n\n"))
        });
        executedToolCalls = toolCollectedHook.toolResults;
        if (toolCollectedHook.stopTurn) {
          assistantText = toolCollectedHook.finalAssistantText ?? t(NDX_AGENT_RESOURCE.TURN_HOOK_TOOL_RESULTS_COLLECTED_STOPPED_MESSAGE);
          finalIteration = iteration;
          break;
        }
        database.logger?.info(NDX_TURN_EVENT.ToolResultsCollected, {
          sessionid: runningSession.sessionid,
          iteration,
          count: executedToolCalls.length,
          successes: executedToolCalls.filter((toolCall) => toolCall.success).length
        });
        const toolResults: NDXToolResultContents[] = [];
        const functionCallOutputs: ResponseToolOutput[] = [];
        for (const [index, toolCall] of toolCalls.entries()) {
          const toolCallId = responseToolCallId(toolCall) || "tool_call";
          const executed = executedToolCalls[index] ?? { tool: summarizeToolName(toolCall), success: false, output: "Tool call did not return a result." };
          toolResults.push({ toolCallId, tool: summarizeToolName(toolCall), success: executed.success, output: executed.output });
          functionCallOutputs.push({ toolCall, output: executed.output });
        }
        const toolResult = await appendSessionData(database, runningSession.sessionid, "assistant", toolResultContents(iteration, toolResults));
        await events.onEvent?.({
          type: NDX_TURN_EVENT.ToolResultRecorded,
          iteration,
          data: toolResult,
          results: executedToolCalls,
          contextUsage: turnContextUsage(sessionDataOutput(toolResults))
        });
        database.logger?.info(NDX_TURN_EVENT.ToolResultRecorded, {
          sessionid: runningSession.sessionid,
          iteration,
          count: executedToolCalls.length,
          successes: executedToolCalls.filter((toolCall) => toolCall.success).length,
          failures: executedToolCalls.filter((toolCall) => !toolCall.success).length
        });
        const previousMessageCount = messages.length;
        const toolResponse: ModelResponse = {
          ...response,
          toolCalls,
          outputItems: toolCalls === response.toolCalls ? response.outputItems : toolCalls
        };
        messages = buildResponsesToolContinuationInput(messages, toolResponse, functionCallOutputs);
        const resumeContextUsage = turnContextUsage();
        database.logger?.info(NDX_TURN_EVENT.ModelResume, {
          sessionid: runningSession.sessionid,
          iteration,
          nextIteration: iteration + 1,
          previousMessageCount,
          nextMessageCount: messages.length,
          toolCallCount: toolCalls.length,
          outputItemCount: response.outputItems.length,
          functionCallOutputCount: functionCallOutputs.length,
          functionCallIds: toolCalls.map((toolCall) => responseToolCallId(toolCall) ?? "tool_call"),
          functionCallOutputBytes: functionCallOutputs.reduce((total, output) => total + Buffer.byteLength(output.output), 0),
          contextTokens: resumeContextUsage.tokens,
          toolDefinitionTokens: resumeContextUsage.toolDefinitionTokens,
          contextsize: resumeContextUsage.contextsize
        });
        await events.onEvent?.({
          type: NDX_TURN_EVENT.ModelResume,
          iteration: iteration + 1,
          results: executedToolCalls,
          contextUsage: turnContextUsage()
        });
        iteration += 1;
        continue;
      }

      assistantText = responseContent;
      finalIteration = iteration;
      database.logger?.info(NDX_TURN_EVENT.ModelResponse, {
        sessionid: runningSession.sessionid,
        iteration,
        model: runningSession.model.model,
        contentLength: assistantText.length
      });
      break;
    }

    await interrupt.setPhase("finalizing");
    const responsePreparedHook = await runResponsePreparedHook(hookRuntime, {
      database,
      session: runningSession,
      requestText: text,
      userHome,
      projectHome,
      iteration: finalIteration,
      messages,
      availableTools,
      modelTools,
      assistantText,
      contextUsage: turnContextUsage(assistantText)
    });
    assistantText = responsePreparedHook.assistantText;
    if (responsePreparedHook.nextRequestText) {
      const updatedSession = await updateSessionEndTurn(database, runningSession.sessionid);
      const nextRequestText = responsePreparedHook.nextRequestText;
      setImmediate(() => {
        void runAgentTurn(database, updatedSession, nextRequestText, model, events).catch((error: unknown) => {
          database.logger?.warn(NDX_TURN_EVENT.Failed, {
            sessionid: runningSession.sessionid,
            error: error instanceof Error ? error.message : String(error)
          });
        });
      });
      return;
    }
    if (responsePreparedHook.stopTurn && !assistantText) {
      assistantText = t(NDX_AGENT_RESOURCE.TURN_HOOK_RESPONSE_PREPARED_STOPPED_MESSAGE);
    }
    const assistant = await appendSessionData(database, runningSession.sessionid, "assistant", assistantMessageContents(assistantText));
    const finalContextUsage = turnContextUsage(assistantText);
    const finalCotWork = cotWorkTiming.complete();
    if (finalCotWork) {
      await events.onEvent?.({
        type: NDX_TURN_EVENT.CotWork,
        iteration: finalIteration,
        tool: "cot_work",
        contents: finalCotWork,
        contextUsage: finalContextUsage
      });
    }
    await events.onEvent?.({ type: NDX_TURN_EVENT.AssistantRecorded, iteration: finalIteration, assistant, contextUsage: finalContextUsage });
    await updateSessionEndTurn(database, runningSession.sessionid);
    return;
  } catch (error) {
    const interruptedError = isTurnInterruptedError(error)
      ? error
      : isTurnInterruptedError(interrupt.signal.reason)
        ? interrupt.signal.reason
        : undefined;
    if (interruptedError) {
      database.logger?.info(NDX_TURN_EVENT.Interrupted, {
        sessionid: runningSession.sessionid,
        phase: interruptedError.phase
      });
      const contextUsage = turnContextUsage(assistantText);
      await events.onEvent?.({ type: NDX_TURN_EVENT.Interrupted, phase: interruptedError.phase, contextUsage });
      const assistant = await appendSessionData(database, runningSession.sessionid, "assistant", errorContents(interruptedError.message));
      const updatedSession = await completeSessionInterrupt(database, runningSession.sessionid);
      await events.onEvent?.({ type: NDX_TURN_EVENT.InterruptCompleted, phase: interruptedError.phase, session: updatedSession, contextUsage });
      void input;
      void assistant;
      return;
    }
    database.logger?.warn(NDX_TURN_EVENT.Failed, {
      sessionid: runningSession.sessionid,
      iteration: activeIteration,
      model: runningSession.model.model,
      providerUrl: runningSession.model.url,
      error: error instanceof Error ? error.message : String(error)
    });
    const assistant = await appendSessionData(database, runningSession.sessionid, "assistant", errorContents(assistantText || (error instanceof Error ? error.message : "model request failed.")));
    const contextUsage = turnContextUsage(assistantText);
    await events.onEvent?.({ type: NDX_TURN_EVENT.AssistantRecorded, iteration: activeIteration || finalIteration, assistant, contextUsage });
    await updateSessionEndTurn(database, runningSession.sessionid);
    return;
  } finally {
    interrupt.complete();
  }
}

export { buildTurnMessages, buildTurnMessageParts } from "./messages.js";
export { getRuntimeTurnPhase, requestRuntimeTurnInterrupt } from "./interrupt.js";
export { turnInterruptPolicy } from "./interruptPolicy.js";
export type { NDXTurnMessageParts } from "./messages.js";
export type { NDXTurnInterruptAction, NDXTurnPhase } from "./interruptPolicy.js";
export type { NDXTurnLoopEvents, NDXTurnLoopEvent } from "./types.js";

function sessionDataOutput(results: NDXToolResultContents[]): string {
  return results.map((result) => `${result.tool}(${result.toolCallId}) ${result.success ? "succeeded" : "failed"}:\n${String(result.output)}`).join("\n\n");
}

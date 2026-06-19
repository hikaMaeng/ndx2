import { assistantReasoningContents } from "../../session/content.js";
import { appendSessionData } from "../../session/appendSessionData.js";
import { rememberSessionModelRequestPrefixPreview } from "../../hook/base/prefixDrift/index.js";
import { runTurnModelRequestHook } from "../../hook/turn.model.request/index.js";
import { runModelRespondingHook } from "../../hook/turn.model.responding/index.js";
import { requestModelResponse, type ModelResponse, type ResponsePreparedRequest, type ResponseStreamInterrupt } from "ndx/common/responseapi";
import { prepareFinalModelRequestMessagesForCall } from "./finalMessages/index.js";
import { calculateDetailedContextUsage } from "../../contextusage/index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import { NDX_AGENT_RESOURCE } from "../../../common/resource/index.js";
import { summarizeToolName } from "../../tool/index.js";
import type { NDXContextUsage } from "../../contextusage/index.js";
import type { NDXActiveTurnPipelineState } from "../types.js";

export const MODEL_PROGRESS_NOTICE_INTERVAL_MS = 120_000;
const MODEL_STREAM_DELTA_FLUSH_CHARS = 512;
const MODEL_STREAM_DELTA_FLUSH_INTERVAL_MS = 250;

export async function callTurnModel(
  state: NDXActiveTurnPipelineState,
  options: { finalizingAfterIterationLimit?: boolean; contextUsage?: NDXContextUsage } = {}
): Promise<void> {
  try {
    const iteration = state.activeIteration || 1;
    const modelRequestMessages = prepareFinalModelRequestMessagesForCall({
      messages: state.messages,
      finalizingAfterIterationLimit: options.finalizingAfterIterationLimit,
      iterationLimitMessage: state.t(NDX_AGENT_RESOURCE.TURN_ITERATION_LIMIT_SYSTEM_MESSAGE, { maxIterations: state.runtimeSettings.maxModelIterations })
    });
    const modelRequestTools = options.finalizingAfterIterationLimit ? [] : state.modelTools;
    const contextUsage = calculateDetailedContextUsage(modelRequestMessages, state.runningSession.model.contextsize, "", modelRequestTools, state.lastModelRequestStablePrefix);
    const modelRequestHook = await runTurnModelRequestHook(state.hookRuntime, {
      database: state.database,
      session: state.runningSession,
      input: state.input,
      requestText: state.text,
      userHome: state.userHome,
      projectHome: state.projectHome,
      language: state.language,
      resource: state.resource,
      iteration,
      messages: modelRequestMessages,
      previousModelRequestStablePrefix: state.lastModelRequestStablePrefix,
      availableTools: state.availableTools,
      modelTools: state.modelTools,
      contextUsage
    });
    for (const prefixDrift of modelRequestHook.result.effect.prefixDrifts ?? []) {
      state.database.logger?.warn(NDX_TURN_EVENT.PrefixDrift, {
        sessionid: state.runningSession.sessionid,
        iteration,
        ...prefixDrift
      });
      await state.events.onEvent?.({
        type: NDX_TURN_EVENT.PrefixDrift,
        iteration,
        drift: prefixDrift,
        contextUsage
      });
    }
    state.lastModelRequestStablePrefix = rememberSessionModelRequestPrefixPreview(state.runningSession.sessionid, modelRequestMessages);
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.ModelRequest, iteration, messages: modelRequestMessages, contextUsage });
    if (options.finalizingAfterIterationLimit) {
      state.database.logger?.warn(NDX_TURN_EVENT.ModelRequest, {
        sessionid: state.runningSession.sessionid,
        iteration,
        maxIterations: state.runtimeSettings.maxModelIterations,
        messageCount: state.messages.length
      });
    } else {
      state.database.logger?.info(NDX_TURN_EVENT.ModelRequest, {
        sessionid: state.runningSession.sessionid,
        iteration,
        model: state.runningSession.model.model,
        providerUrl: state.runningSession.model.url,
        tools: state.availableTools.map((tool) => ({ name: tool.name, source: tool.source, definitionPath: tool.definitionPath }))
      });
    }

    const modelResponseStartedAt = Date.now();
    let modelResponseSequence = 0;
    const stopModelProgressNotice = startModelProgressNotice(state, iteration, modelResponseStartedAt, contextUsage);
    const streamDispatcher = createModelStreamDispatcher(state, {
      iteration,
      startedAt: modelResponseStartedAt,
      finalizingAfterIterationLimit: options.finalizingAfterIterationLimit,
      nextSequence: () => ++modelResponseSequence
    });
    let stopModelResponseForFlush: ResponseStreamInterrupt | undefined;
    let response: ModelResponse;
    try {
      response = await requestModelResponse(
        { ...state.runningSession.model, strictPrefixCache: state.runtimeSettings.strictPrefixCache },
        modelRequestMessages,
        modelRequestTools,
        {
          signal: state.interrupt.signal,
          onRequestPrepared: async (preparedRequest) => {
            const prefixComparison = comparePreparedModelRequestPrefix(state.lastPreparedModelRequest, preparedRequest);
            if (prefixComparison) {
              const logContext = {
                sessionid: state.runningSession.sessionid,
                iteration,
                ...prefixComparison
              };
              if (prefixComparison.appendOnlyPrefix) {
                state.database.logger?.debug("turn.model.request.provider_prefix_reused", logContext);
              } else if (prefixComparison.likelyOneRequestAttachmentException) {
                state.database.logger?.debug("turn.model.request.provider_prefix_attachment_exception", logContext);
              } else {
                state.database.logger?.warn("turn.model.request.provider_prefix_drift", logContext);
              }
            }
            state.lastPreparedModelRequest = preparedRequest;
          },
          onText: async (delta, content, stopModelResponse, metadata) => {
            await state.interrupt.checkpoint();
            stopModelResponseForFlush = stopModelResponse;
            await streamDispatcher.text(delta, content, metadata?.role ?? "assistant_text", stopModelResponse);
          },
          onReasoning: async (summary, content, stopModelResponse) => {
            await state.interrupt.checkpoint();
            stopModelResponseForFlush = stopModelResponse;
            await streamDispatcher.reasoning(summary, content, stopModelResponse);
          },
          onToolCall: options.finalizingAfterIterationLimit ? undefined : async (toolCall, stopModelResponse) => {
            await state.interrupt.checkpoint();
            stopModelResponseForFlush = stopModelResponse;
            await streamDispatcher.flush(stopModelResponse);
            await processModelRespondingHook(state, {
              type: "tool_call",
              toolCall,
              elapsedMs: Date.now() - modelResponseStartedAt,
              sequence: ++modelResponseSequence
            }, stopModelResponse);
            state.database.logger?.debug(NDX_TURN_EVENT.ToolCallRecorded, {
              sessionid: state.runningSession.sessionid,
              iteration,
              tool: summarizeToolName(toolCall)
            });
          },
          onDebug: async (event, debugContext) => {
            state.database.logger?.debug(event, {
              sessionid: state.runningSession.sessionid,
              iteration,
              ...(options.finalizingAfterIterationLimit ? { finalizingAfterIterationLimit: true } : {}),
              ...debugContext
            });
          }
        }
      );
      await streamDispatcher.flush(stopModelResponseForFlush);
    } finally {
      stopModelProgressNotice();
    }
    if (response.reasoning?.trim()) {
      await appendSessionData(state.database, state.runningSession.sessionid, "assistant", assistantReasoningContents(iteration, response.reasoning));
    }
    if (options.finalizingAfterIterationLimit) {
      state.assistantText = response.content.trim() || state.t(NDX_AGENT_RESOURCE.TURN_ITERATION_LIMIT_EMPTY_RESPONSE_MESSAGE, { maxIterations: state.runtimeSettings.maxModelIterations });
      state.finalIteration = iteration;
      state.database.logger?.warn(NDX_TURN_EVENT.ModelResponse, {
        sessionid: state.runningSession.sessionid,
        iteration,
        contentLength: state.assistantText.length,
        toolCallCount: response.toolCalls.length
      });
      return state.pipeline.finishAfterLoop(state);
    }
    state.database.logger?.info(NDX_TURN_EVENT.ModelResponse, {
      sessionid: state.runningSession.sessionid,
      iteration,
      contentLength: response.content.length,
      toolCallCount: response.toolCalls.length,
      outputItemCount: response.outputItems.length
    });
    return state.pipeline.handleModelResponse(state, response);
  } catch (error) {
    return state.pipeline.handleTurnFailure(state, error);
  }
}

function comparePreparedModelRequestPrefix(previous: ResponsePreparedRequest | undefined, next: ResponsePreparedRequest): Record<string, unknown> | undefined {
  if (!previous || previous.endpoint !== next.endpoint || previous.model !== next.model) {
    return undefined;
  }
  const commonPrefixLength = commonStringPrefixLength(previous.inputSerialized, next.inputSerialized);
  const appendOnlyPrefix = next.inputSerialized.startsWith(previous.inputSerialized);
  return {
    appendOnlyPrefix,
    previousInputMode: previous.inputMode,
    nextInputMode: next.inputMode,
    previousInputBodyIndex: previous.inputBodyIndex,
    nextInputBodyIndex: next.inputBodyIndex,
    previousInputSerializedLength: previous.inputSerializedLength,
    nextInputSerializedLength: next.inputSerializedLength,
    commonPrefixLength,
    previousInputSha256: previous.inputSha256,
    nextInputSha256: next.inputSha256,
    firstDivergencePreviousPreview: appendOnlyPrefix ? undefined : previous.inputSerialized.slice(commonPrefixLength, commonPrefixLength + 160),
    firstDivergenceNextPreview: appendOnlyPrefix ? undefined : next.inputSerialized.slice(commonPrefixLength, commonPrefixLength + 160),
    likelyOneRequestAttachmentException: likelyOneRequestAttachmentException(previous, next)
  };
}

function commonStringPrefixLength(previous: string, next: string): number {
  const length = Math.min(previous.length, next.length);
  for (let index = 0; index < length; index += 1) {
    if (previous.charCodeAt(index) !== next.charCodeAt(index)) {
      return index;
    }
  }
  return length;
}

function likelyOneRequestAttachmentException(previous: ResponsePreparedRequest, next: ResponsePreparedRequest): boolean {
  return previous.inputSerialized.includes("\"input_image\"") ||
    previous.inputSerialized.includes("\"input_file\"") ||
    next.inputSerialized.includes("\"input_image\"") ||
    next.inputSerialized.includes("\"input_file\"");
}

function createModelStreamDispatcher(
  state: NDXActiveTurnPipelineState,
  options: {
    iteration: number;
    startedAt: number;
    finalizingAfterIterationLimit?: boolean;
    nextSequence: () => number;
  }
) {
  let pendingTextDelta = "";
  let pendingTextContent = "";
  let pendingTextRole: "assistant_text" | "implicit_thinking_candidate" | undefined;
  let pendingTextSequence = 0;
  let pendingTextUpdatedAt = 0;
  let pendingReasoningSummary = "";
  let pendingReasoningContent = "";
  let pendingReasoningSequence = 0;
  let pendingReasoningUpdatedAt = 0;

  const shouldFlush = (pendingLength: number, updatedAt: number) => (
    pendingLength >= MODEL_STREAM_DELTA_FLUSH_CHARS || (updatedAt > 0 && Date.now() - updatedAt >= MODEL_STREAM_DELTA_FLUSH_INTERVAL_MS)
  );

  const flushText = async (stopModelResponse?: ResponseStreamInterrupt): Promise<void> => {
    if (pendingTextDelta.length === 0) {
      return;
    }
    const delta = pendingTextDelta;
    const content = pendingTextContent;
    const textRole = pendingTextRole ?? "assistant_text";
    const sequence = pendingTextSequence;
    pendingTextDelta = "";
    pendingTextContent = "";
    pendingTextRole = undefined;
    pendingTextSequence = 0;
    pendingTextUpdatedAt = 0;
    if (stopModelResponse) {
      await processModelRespondingHook(state, {
        type: "text",
        delta,
        content,
        textRole,
        elapsedMs: Date.now() - options.startedAt,
        sequence
      }, stopModelResponse);
    }
    await state.events.onEvent?.({
      type: NDX_TURN_EVENT.AssistantDelta,
      iteration: options.iteration,
      delta,
      content,
      contextUsage: state.turnContextUsage(content, options.finalizingAfterIterationLimit ? [] : state.modelTools)
    });
  };

  const flushReasoning = async (stopModelResponse?: ResponseStreamInterrupt): Promise<void> => {
    if (pendingReasoningSummary.length === 0) {
      return;
    }
    const summary = pendingReasoningSummary;
    const content = pendingReasoningContent;
    const sequence = pendingReasoningSequence;
    pendingReasoningSummary = "";
    pendingReasoningContent = "";
    pendingReasoningSequence = 0;
    pendingReasoningUpdatedAt = 0;
    if (stopModelResponse) {
      await processModelRespondingHook(state, {
        type: "reasoning",
        summary,
        content,
        elapsedMs: Date.now() - options.startedAt,
        sequence
      }, stopModelResponse);
    }
    await state.events.onEvent?.({
      type: NDX_TURN_EVENT.AssistantReasoning,
      iteration: options.iteration,
      summary,
      contextUsage: state.turnContextUsage(content, options.finalizingAfterIterationLimit ? [] : state.modelTools)
    });
  };

  const flush = async (stopModelResponse?: ResponseStreamInterrupt): Promise<void> => {
    await flushText(stopModelResponse);
    await flushReasoning(stopModelResponse);
  };

  return {
    async text(delta: string, content: string, textRole: "assistant_text" | "implicit_thinking_candidate", stopModelResponse: ResponseStreamInterrupt): Promise<void> {
      const sequence = options.nextSequence();
      if (pendingReasoningSummary.length > 0 || (pendingTextRole && pendingTextRole !== textRole)) {
        await flush(stopModelResponse);
      }
      if (pendingTextDelta.length === 0) {
        pendingTextUpdatedAt = Date.now();
      }
      pendingTextDelta += delta;
      pendingTextContent = content;
      pendingTextRole = textRole;
      pendingTextSequence = sequence;
      if (shouldFlush(pendingTextDelta.length, pendingTextUpdatedAt)) {
        await flushText(stopModelResponse);
      }
    },
    async reasoning(summary: string, content: string, stopModelResponse: ResponseStreamInterrupt): Promise<void> {
      const sequence = options.nextSequence();
      if (pendingTextDelta.length > 0) {
        await flushText(stopModelResponse);
      }
      if (pendingReasoningSummary.length === 0) {
        pendingReasoningUpdatedAt = Date.now();
      }
      pendingReasoningSummary = summary;
      pendingReasoningContent = content;
      pendingReasoningSequence = sequence;
      if (shouldFlush(pendingReasoningSummary.length, pendingReasoningUpdatedAt)) {
        await flushReasoning(stopModelResponse);
      }
    },
    flush,
    flushText,
    flushReasoning
  };
}

export function startModelProgressNotice(
  state: NDXActiveTurnPipelineState,
  iteration: number,
  startedAt: number,
  contextUsage: NDXContextUsage,
  intervalMs = MODEL_PROGRESS_NOTICE_INTERVAL_MS
): () => void {
  const interval = setInterval(() => {
    const elapsedMs = Date.now() - startedAt;
    const elapsedSeconds = Math.max(1, Math.round(elapsedMs / 1000));
    const message = state.t(NDX_AGENT_RESOURCE.TURN_MODEL_PROGRESS_MESSAGE, { elapsedSeconds });
    void state.events.onEvent?.({
      type: NDX_TURN_EVENT.ModelProgress,
      iteration,
      elapsedMs,
      intervalMs,
      message,
      contextUsage
    }).catch((error) => {
      state.database.logger?.warn("turn.model.progress.notify_failed", {
        sessionid: state.runningSession.sessionid,
        iteration,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, intervalMs);
  interval.unref?.();
  return () => clearInterval(interval);
}

async function processModelRespondingHook(
  state: NDXActiveTurnPipelineState,
  modelResponse: Parameters<typeof runModelRespondingHook>[1]["modelResponse"],
  stopModelResponse: ResponseStreamInterrupt
): Promise<void> {
  const hook = await runModelRespondingHook(state.hookRuntime, {
    database: state.database,
    session: state.runningSession,
    requestText: state.text,
    userHome: state.userHome,
    projectHome: state.projectHome,
    iteration: state.activeIteration || 1,
    messages: state.messages,
    availableTools: state.availableTools,
    modelTools: state.modelTools,
    modelResponse,
    contextUsage: modelResponse?.type === "reasoning" ? state.turnContextUsage(modelResponse.content) : modelResponse?.type === "text" ? state.turnContextUsage(modelResponse.content) : state.turnContextUsage()
  });
  if (hook.interruptModelResponse) {
    await stopModelResponse(hook.interruptReason);
  }
}

export type NDXTurnModelResponse = ModelResponse;

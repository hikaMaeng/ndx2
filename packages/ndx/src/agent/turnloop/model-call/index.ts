import { assistantReasoningContents } from "../../session/content.js";
import { appendSessionData } from "../../session/appendSessionData.js";
import { runTurnModelRequestHook } from "../../hook/turn.model.request/index.js";
import { runModelRespondingHook } from "../../hook/turn.model.responding/index.js";
import { requestModelResponse, type ModelResponse, type ResponseStreamInterrupt } from "ndx/common/responseapi";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import { NDX_AGENT_RESOURCE } from "../../../common/resource/index.js";
import { summarizeToolName } from "../../tool/index.js";
import type { NDXContextUsage } from "../../contextusage/index.js";
import type { NDXActiveTurnPipelineState } from "../types.js";

export const MODEL_PROGRESS_NOTICE_INTERVAL_MS = 120_000;

export async function callTurnModel(
  state: NDXActiveTurnPipelineState,
  options: { finalizingAfterIterationLimit?: boolean; contextUsage?: NDXContextUsage } = {}
): Promise<void> {
  try {
    const iteration = state.activeIteration || 1;
    const contextUsage = options.contextUsage ?? state.turnContextUsage(options.finalizingAfterIterationLimit ? "" : undefined, options.finalizingAfterIterationLimit ? [] : undefined);
    const modelRequestMessages = options.finalizingAfterIterationLimit
      ? [
          ...state.messages,
          {
            role: "system",
            content: state.t(NDX_AGENT_RESOURCE.TURN_ITERATION_LIMIT_SYSTEM_MESSAGE, { maxIterations: state.runtimeSettings.maxModelIterations })
          }
      ]
      : state.messages;
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
      previousModelRequestMessages: state.lastModelRequestMessages,
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
    state.lastModelRequestMessages = JSON.parse(JSON.stringify(modelRequestMessages)) as typeof modelRequestMessages;
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
    let response: ModelResponse;
    try {
      response = await requestModelResponse(
        state.runningSession.model,
        modelRequestMessages,
        options.finalizingAfterIterationLimit ? [] : state.modelTools,
        {
          signal: state.interrupt.signal,
          onText: async (delta, content, stopModelResponse) => {
            await state.interrupt.checkpoint();
            await processModelRespondingHook(state, {
              type: "text",
              delta,
              content,
              elapsedMs: Date.now() - modelResponseStartedAt,
              sequence: ++modelResponseSequence
            }, stopModelResponse);
            await state.events.onEvent?.({
              type: NDX_TURN_EVENT.AssistantDelta,
              iteration,
              delta,
              content,
              contextUsage: state.turnContextUsage(content, options.finalizingAfterIterationLimit ? [] : state.modelTools)
            });
          },
          onReasoning: async (summary, content, stopModelResponse) => {
            await state.interrupt.checkpoint();
            await processModelRespondingHook(state, {
              type: "reasoning",
              summary,
              content,
              elapsedMs: Date.now() - modelResponseStartedAt,
              sequence: ++modelResponseSequence
            }, stopModelResponse);
            await state.events.onEvent?.({
              type: NDX_TURN_EVENT.AssistantReasoning,
              iteration,
              summary,
              contextUsage: state.turnContextUsage(content, options.finalizingAfterIterationLimit ? [] : state.modelTools)
            });
          },
          onToolCall: options.finalizingAfterIterationLimit ? undefined : async (toolCall, stopModelResponse) => {
            await state.interrupt.checkpoint();
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

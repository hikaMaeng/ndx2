import { promises as fs } from "node:fs";
import path from "node:path";
import { assistantDeltaContents, toolCallContents, toolGeneratedUserMessageContents, toolResultContents } from "../../session/content.js";
import { appendSessionData } from "../../session/appendSessionData.js";
import { addInlineAttachmentDataIds } from "../../session/runtimeData.js";
import { runToolCalledHook } from "../../hook/turn.tool.called/index.js";
import { runToolResultsCollectedHook } from "../../hook/turn.tool.results.collected/index.js";
import { executeToolCalls, summarizeToolName } from "../../tool/index.js";
import { createCotWorkAgentCallHandler, NDX_COT_WORK_AGENTCALL_NAME } from "../../tool/base/cot_work/agentCall.js";
import { cotWorkCompletedSidebarItems } from "../../tool/base/cot_work/sidebar.js";
import { createSidebarItemAgentCallHandler, NDX_SIDEBAR_ITEM_AGENTCALL_NAME } from "../../tool/execute/agentcall/index.js";
import { responseToolCallId, type ModelResponse } from "ndx/common/responseapi";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import { NDX_AGENT_RESOURCE } from "../../../common/resource/index.js";
import { refreshCurrentMessageParts, refreshTurnMessages } from "../base/state/index.js";
import type { NDXContextUsage } from "../../contextusage/index.js";
import type { NDXToolResultContents } from "../../session/index.js";
import type { NDXSessionDataRow } from "../../session/types.js";
import type { NDXToolExecutionResult, NDXToolResultEffect } from "../../tool/index.js";
import type { NDXCotWorkContents, NDXSessionAttachmentReference } from "../../../common/protocol/index.js";
import type { NDXActiveTurnPipelineState } from "../types.js";

type PendingCotWorkEvent = {
  toolCallIndex: number;
  sequence: number;
  tool: string;
  callId?: string;
  contents: NDXCotWorkContents;
};

export async function processToolCalls(state: NDXActiveTurnPipelineState, response: ModelResponse): Promise<void> {
  try {
    const iteration = state.activeIteration || 1;
    const responseContent = response.content;
    let toolCalls = response.toolCalls;
    const toolCalledHook = await runToolCalledHook(state.hookRuntime, {
      database: state.database,
      session: state.runningSession,
      requestText: state.text,
      userHome: state.userHome,
      projectHome: state.projectHome,
      language: state.language,
      resource: state.resource,
      iteration,
      messages: state.messages,
      availableTools: state.availableTools,
      modelTools: state.modelTools,
      assistantText: responseContent,
      toolCalls,
      contextUsage: state.turnContextUsage(responseContent)
    });
    toolCalls = toolCalledHook.toolCalls;
    if (toolCalledHook.stopTurn) {
      state.assistantText = toolCalledHook.finalAssistantText ?? (responseContent || state.t(NDX_AGENT_RESOURCE.TURN_HOOK_TOOL_CALLED_STOPPED_MESSAGE));
      state.finalIteration = iteration;
      return state.pipeline.finishAfterLoop(state);
    }
    if (responseContent.trim().length > 0) {
      await appendSessionData(state.database, state.runningSession.sessionid, "assistant", assistantDeltaContents(iteration, responseContent, responseContent));
    }
    for (const toolCall of toolCalls) {
      const data = await appendSessionData(state.database, state.runningSession.sessionid, "tool_call", toolCallContents(iteration, [toolCall]));
      await state.events.onEvent?.({
        type: NDX_TURN_EVENT.ToolCallRecorded,
        iteration,
        data,
        toolCall,
        contextUsage: state.turnContextUsage()
      });
    }
    await state.interrupt.setPhase("tool_execution");
    const toolContextUsage = state.turnContextUsage();
    await state.events.onEvent?.({ type: NDX_TURN_EVENT.ToolBatchStarted, iteration, toolCalls, contextUsage: toolContextUsage });
    state.database.logger?.info(NDX_TURN_EVENT.ToolCalled, {
      sessionid: state.runningSession.sessionid,
      iteration,
      count: toolCalls.length,
      tools: toolCalls.map(summarizeToolName)
    });
    const pendingCotWorkEvents: PendingCotWorkEvent[] = [];
    let pendingCotWorkSequence = 0;
    let executedToolCalls = await executeToolCalls(toolCalls, {
      cwd: state.projectHome,
      userHome: state.userHome,
      projectHome: state.projectHome,
      database: state.database,
      session: state.runningSession,
      model: state.runningSession.model,
      onSubsessionEvent: state.events.onSubsessionEvent,
      sessionid: state.runningSession.sessionid,
      turnId: String(state.input.dataid),
      iteration,
      turnContext: await refreshCurrentMessageParts(state),
      signal: state.interrupt.signal,
      sessionClientBridge: state.events.sessionClientBridge,
      sessionRequestQueueBridge: state.events.sessionRequestQueueBridge,
      sessionRequestQueueConsumerBridge: state.events.sessionRequestQueueConsumerBridge,
      observer: {
        async onToolStarted(event) {
          await state.interrupt.checkpoint();
          await state.events.onEvent?.({
            type: NDX_TURN_EVENT.ToolProgress,
            status: "started",
            iteration,
            tool: event.tool,
            callId: event.callId,
            args: event.args,
            startedAt: event.startedAt,
            contextUsage: toolContextUsage
          });
          await state.interrupt.checkpoint();
        },
        async onToolProgress(event) {
          await state.interrupt.checkpoint();
          await state.events.onEvent?.({
            type: NDX_TURN_EVENT.ToolProgress,
            status: "progress",
            iteration,
            tool: event.tool,
            callId: event.callId,
            event: event.event,
            receivedAt: event.receivedAt,
            contextUsage: toolContextUsage
          });
          await state.interrupt.checkpoint();
        },
        async onToolInterrupt(event) {
          await state.events.onEvent?.({
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
          await state.interrupt.checkpoint();
        },
        async onToolFinished(result) {
          await state.events.onEvent?.({
            type: NDX_TURN_EVENT.ToolProgress,
            status: "finished",
            iteration,
            result,
            contextUsage: state.turnContextUsage(result.output)
          });
        }
      },
      agentCallHandlers: {
        [NDX_SIDEBAR_ITEM_AGENTCALL_NAME]: createSidebarItemAgentCallHandler(async (item, context) => {
          await state.interrupt.checkpoint();
          await state.events.onEvent?.({
            type: NDX_TURN_EVENT.SidebarItem,
            iteration,
            tool: context.tool,
            callId: context.callId,
            item,
            contextUsage: toolContextUsage
          });
          await state.interrupt.checkpoint();
        }),
        [NDX_COT_WORK_AGENTCALL_NAME]: createCotWorkAgentCallHandler(async (contents, context) => {
          await state.interrupt.checkpoint();
          pendingCotWorkEvents.push({
            toolCallIndex: typeof context.toolCallIndex === "number" ? context.toolCallIndex : Number.MAX_SAFE_INTEGER,
            sequence: pendingCotWorkSequence,
            tool: context.tool,
            ...(context.callId ? { callId: context.callId } : {}),
            contents
          });
          pendingCotWorkSequence += 1;
          await state.interrupt.checkpoint();
        })
      }
    });
    await commitPendingCotWorkEvents(state, pendingCotWorkEvents, iteration, toolContextUsage);
    if (state.interrupt.signal.aborted) {
      const { row: toolResult, toolResults } = await appendToolResultRow(state.database, state.runningSession.sessionid, iteration, toolCalls, executedToolCalls);
      await state.events.onEvent?.({
        type: NDX_TURN_EVENT.ToolResultRecorded,
        iteration,
        data: toolResult,
        results: executedToolCalls,
        contextUsage: state.turnContextUsage(sessionDataOutput(toolResults))
      });
      state.database.logger?.info(NDX_TURN_EVENT.ToolResultRecorded, {
        sessionid: state.runningSession.sessionid,
        iteration,
        count: executedToolCalls.length,
        successes: executedToolCalls.filter((toolCall) => toolCall.success).length,
        failures: executedToolCalls.filter((toolCall) => !toolCall.success).length,
        interrupted: true
      });
      await state.interrupt.checkpoint();
    }
    await state.interrupt.checkpoint();
    const toolCollectedHook = await runToolResultsCollectedHook(state.hookRuntime, {
      database: state.database,
      session: state.runningSession,
      requestText: state.text,
      userHome: state.userHome,
      projectHome: state.projectHome,
      language: state.language,
      resource: state.resource,
      iteration,
      messages: state.messages,
      availableTools: state.availableTools,
      modelTools: state.modelTools,
      toolCalls,
      toolResults: executedToolCalls,
      contextUsage: state.turnContextUsage(executedToolCalls.map((toolCall) => toolCall.output).join("\n\n"))
    });
    executedToolCalls = toolCollectedHook.toolResults;
    if (toolCollectedHook.stopTurn) {
      state.assistantText = toolCollectedHook.finalAssistantText ?? state.t(NDX_AGENT_RESOURCE.TURN_HOOK_TOOL_RESULTS_COLLECTED_STOPPED_MESSAGE);
      state.finalIteration = iteration;
      return state.pipeline.finishAfterLoop(state);
    }
    state.database.logger?.info(NDX_TURN_EVENT.ToolResultsCollected, {
      sessionid: state.runningSession.sessionid,
      iteration,
      count: executedToolCalls.length,
      successes: executedToolCalls.filter((toolCall) => toolCall.success).length
    });
    const { row: toolResult, toolResults } = await appendToolResultRow(state.database, state.runningSession.sessionid, iteration, toolCalls, executedToolCalls);
    await state.events.onEvent?.({
      type: NDX_TURN_EVENT.ToolResultRecorded,
      iteration,
      data: toolResult,
      results: executedToolCalls,
      contextUsage: state.turnContextUsage(sessionDataOutput(toolResults))
    });
    state.database.logger?.info(NDX_TURN_EVENT.ToolResultRecorded, {
      sessionid: state.runningSession.sessionid,
      iteration,
      count: executedToolCalls.length,
      successes: executedToolCalls.filter((toolCall) => toolCall.success).length,
      failures: executedToolCalls.filter((toolCall) => !toolCall.success).length
    });
    const generatedInput = await appendToolGeneratedUserMessage(state.database, state.runningSession.sessionid, iteration, executedToolCalls, { projectHome: state.projectHome, userHome: state.userHome });
    if (generatedInput?.inlineAttachments) {
      await addInlineAttachmentDataIds(state.database, state.runningSession.sessionid, [generatedInput.row.dataid]);
    }
    const previousMessageCount = state.messages.length;
    await refreshTurnMessages(state);
    const resumeContextUsage = state.turnContextUsage();
    state.database.logger?.info(NDX_TURN_EVENT.ModelResume, {
      sessionid: state.runningSession.sessionid,
      iteration,
      nextIteration: iteration + 1,
      previousMessageCount,
      nextMessageCount: state.messages.length,
      toolCallCount: toolCalls.length,
      outputItemCount: response.outputItems.length,
      functionCallOutputCount: toolResults.length,
      functionCallIds: toolCalls.map((toolCall) => responseToolCallId(toolCall) ?? "tool_call"),
      functionCallOutputBytes: toolResults.reduce((total, output) => total + Buffer.byteLength(String(output.output)), 0),
      contextTokens: resumeContextUsage.tokens,
      toolDefinitionTokens: resumeContextUsage.toolDefinitionTokens,
      contextsize: resumeContextUsage.contextsize
    });
    await state.events.onEvent?.({
      type: NDX_TURN_EVENT.ModelResume,
      iteration: iteration + 1,
      results: executedToolCalls,
      contextUsage: state.turnContextUsage()
    });
    state.activeIteration = iteration + 1;
    return state.pipeline.prepareTurnIteration(state);
  } catch (error) {
    return state.pipeline.handleTurnFailure(state, error);
  }
}

async function commitPendingCotWorkEvents(
  state: NDXActiveTurnPipelineState,
  pendingCotWorkEvents: PendingCotWorkEvent[],
  iteration: number,
  contextUsage: NDXContextUsage
): Promise<void> {
  for (const event of [...pendingCotWorkEvents].sort((left, right) => left.toolCallIndex - right.toolCallIndex || left.sequence - right.sequence)) {
    await state.interrupt.checkpoint();
    const timedContents = state.cotWorkTiming.update(event.contents);
    await appendSessionData(state.database, state.runningSession.sessionid, "assistant", timedContents);
    for (const item of cotWorkCompletedSidebarItems(timedContents)) {
      await state.events.onEvent?.({
        type: NDX_TURN_EVENT.SidebarItem,
        iteration,
        tool: event.tool,
        callId: event.callId,
        item,
        contextUsage
      });
    }
    await state.events.onEvent?.({
      type: NDX_TURN_EVENT.CotWork,
      iteration,
      tool: event.tool,
      callId: event.callId,
      contents: timedContents,
      contextUsage
    });
    await state.interrupt.checkpoint();
  }
}

async function appendToolGeneratedUserMessage(
  database: NDXActiveTurnPipelineState["database"],
  sessionid: string,
  iteration: number,
  results: NDXToolExecutionResult[],
  roots: { projectHome: string; userHome: string }
): Promise<{ row: NDXSessionDataRow; inlineAttachments: boolean } | undefined> {
  const appendEffects: Array<{ result: NDXToolExecutionResult; effect: Extract<NDXToolResultEffect, { type: "append_user_message" }> }> = [];
  let inlineAttachments = false;
  for (const result of results) {
    for (const effect of result.effects ?? []) {
      if (effect.type === "append_user_message") {
        appendEffects.push({ result, effect });
      }
      if (effect.type === "inline_appended_user_message") {
        inlineAttachments = true;
      }
    }
  }
  if (appendEffects.length === 0) {
    return undefined;
  }

  const attachments: NDXSessionAttachmentReference[] = [];
  const text: string[] = [];
  const sources: Array<{ tool: string; toolCallId?: string; iteration?: number }> = [];
  for (const { result, effect } of appendEffects) {
    if (typeof effect.text === "string" && effect.text.trim().length > 0) {
      text.push(effect.text.trim());
    }
    sources.push({ tool: result.tool, ...(result.callId ? { toolCallId: result.callId } : {}), iteration });
    for (const attachment of effect.attachments ?? []) {
      const normalized = await normalizeToolGeneratedAttachment(attachment, roots);
      if (normalized) {
        attachments.push(normalized);
      }
    }
  }
  const row = await appendSessionData(
    database,
    sessionid,
    "assistant",
    toolGeneratedUserMessageContents(text.join("\n\n") || "Tool-generated input was added.", attachments, sources)
  );
  return { row, inlineAttachments };
}

async function normalizeToolGeneratedAttachment(
  attachment: NonNullable<Extract<NDXToolResultEffect, { type: "append_user_message" }>["attachments"]>[number],
  roots: { projectHome: string; userHome: string }
): Promise<NDXSessionAttachmentReference | undefined> {
  if (!attachment || typeof attachment.path !== "string" || typeof attachment.mimeType !== "string") {
    return undefined;
  }
  const realPath = await fs.realpath(attachment.path);
  const allowedRoots = await Promise.all([roots.projectHome, roots.userHome].map((root) => fs.realpath(root).catch(() => root)));
  if (!allowedRoots.some((root) => realPath === root || realPath.startsWith(`${root}${path.sep}`))) {
    throw new Error(`tool-generated attachment escapes allowed roots: ${attachment.path}`);
  }
  const stat = await fs.stat(realPath);
  if (!stat.isFile()) {
    return undefined;
  }
  const mimeType = attachment.mimeType.trim() || "application/octet-stream";
  return {
    kind: attachment.kind === "image" || attachment.kind === "file" ? attachment.kind : mimeType.toLowerCase().startsWith("image/") ? "image" : "file",
    path: realPath,
    name: typeof attachment.name === "string" && attachment.name.trim() ? attachment.name.trim() : path.basename(realPath),
    mimeType,
    size: typeof attachment.size === "number" && Number.isFinite(attachment.size) && attachment.size > 0 ? attachment.size : stat.size
  };
}

function sessionDataOutput(results: NDXToolResultContents[]): string {
  return results.map((result) => `${result.tool}(${result.toolCallId}) ${result.success ? "succeeded" : "failed"}:\n${String(result.output)}`).join("\n\n");
}

async function appendToolResultRow(
  database: NDXActiveTurnPipelineState["database"],
  sessionid: string,
  iteration: number,
  toolCalls: unknown[],
  executedToolCalls: NDXToolExecutionResult[]
): Promise<{ row: NDXSessionDataRow; toolResults: NDXToolResultContents[] }> {
  const toolResults: NDXToolResultContents[] = [];
  for (const [index, toolCall] of toolCalls.entries()) {
    const toolCallId = responseToolCallId(toolCall) || "tool_call";
    const executed = executedToolCalls[index] ?? { tool: summarizeToolName(toolCall), success: false, output: "Tool call did not return a result." };
    toolResults.push({ toolCallId, tool: summarizeToolName(toolCall), success: executed.success, output: executed.output });
  }
  return {
    row: await appendSessionData(database, sessionid, "assistant", toolResultContents(iteration, toolResults)),
    toolResults
  };
}

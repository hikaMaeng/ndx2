import { handleUserRequest } from "./request/index.js";
import { getSession } from "../session/getSession.js";
import { NDX_TURN_EVENT } from "../../common/protocol/index.js";
import type { NDXHookTurnEndRequestEffect } from "../hook/index.js";
import type { NDXDatabase, NDXModelConfig, NDXSessionRow } from "../session/types.js";
import type { NDXTurnInput, NDXTurnLoopEvent, NDXTurnLoopEvents, NDXTurnResult } from "./types.js";

export const NDX_COMPACT_CONTINUATION_REQUEST_TEXT = [
  "컨텍스트 compact로 직전 턴이 종료되었습니다.",
  "compact 뒤에 보존된 직전 턴의 직접 히스토리를 기준으로, 사용자 요청을 계속 수행하세요."
].join("\n");

export async function runAgentTurn(
  database: NDXDatabase,
  session: NDXSessionRow,
  request: NDXTurnInput,
  model?: NDXModelConfig,
  events: NDXTurnLoopEvents = {}
): Promise<NDXTurnResult> {
  return handleUserRequest(database, session, request, model, events);
}

export async function runAgentTurnWithCompactContinuation(
  database: NDXDatabase,
  session: NDXSessionRow,
  request: NDXTurnInput,
  model?: NDXModelConfig,
  events: NDXTurnLoopEvents = {},
  options: { maxContinuations?: number } = {}
): Promise<NDXTurnResult> {
  let currentSession = session;
  let currentRequest = request;
  let currentModel = model;
  const maxContinuations = options.maxContinuations ?? 1;

  for (let turnIndex = 0; turnIndex <= maxContinuations; turnIndex += 1) {
    let compactEndedTurn = false;
    const result = await runAgentTurn(database, currentSession, currentRequest, currentModel, {
      ...events,
      async onEvent(event: NDXTurnLoopEvent) {
        if (event.type === NDX_TURN_EVENT.CompactCompleted && event.report.phase === "iteration") {
          compactEndedTurn = true;
        }
        await events.onEvent?.(event);
      }
    });
    if (!compactEndedTurn || turnIndex >= maxContinuations) {
      return result;
    }
    const nextSession = await getSession(database, currentSession.sessionid);
    if (!nextSession) {
      return result;
    }
    currentSession = nextSession;
    currentRequest = { text: NDX_COMPACT_CONTINUATION_REQUEST_TEXT };
    currentModel = undefined;
  }
  return {};
}

export async function runAgentTurnWithAfterResponseTriggers(
  database: NDXDatabase,
  session: NDXSessionRow,
  request: NDXTurnInput,
  model: NDXModelConfig | undefined,
  events: NDXTurnLoopEvents,
  options: { maxCompactContinuations?: number; maxTriggeredRequests?: number } = {}
): Promise<NDXAfterResponseTriggerLaunch | undefined> {
  const result = await runAgentTurnWithCompactContinuation(database, session, request, model, events, {
    maxContinuations: options.maxCompactContinuations
  });
  const turnEndRequest = result.turnEndHookResult?.effect.turnEndRequest;
  if (!turnEndRequest) {
    return undefined;
  }
  const maxTriggeredRequests = options.maxTriggeredRequests ?? 100;
  if (maxTriggeredRequests <= 0) {
    await releaseTurnEndRequestClaim(events, turnEndRequest);
    return undefined;
  }
  return launchTurnEndRequestChain(database, session.sessionid, turnEndRequest, events, options, 1);
}

export type NDXAfterResponseTriggerLaunch = {
  finished: Promise<void>;
};

function launchTurnEndRequestChain(
  database: NDXDatabase,
  sessionid: string,
  request: NDXHookTurnEndRequestEffect,
  events: NDXTurnLoopEvents,
  options: { maxCompactContinuations?: number; maxTriggeredRequests?: number },
  requestNumber: number
): NDXAfterResponseTriggerLaunch {
  const finished = new Promise<void>((resolve) => {
    setTimeout(() => {
      void runTurnEndRequestChain(database, sessionid, request, events, options, requestNumber)
        .catch((error) => {
          database.logger?.error("agent.turnloop.turn_end_request.failed", {
            sessionid,
            error: error instanceof Error ? error.message : String(error)
          });
        })
        .finally(resolve);
    }, 0);
  });
  return { finished };
}

export async function runQueuedAgentTurns(
  database: NDXDatabase,
  session: NDXSessionRow,
  events: NDXTurnLoopEvents,
  options: { maxCompactContinuations?: number; maxTriggeredRequests?: number } = {}
): Promise<NDXAfterResponseTriggerLaunch | undefined> {
  if (session.isrunning || !events.sessionRequestQueueConsumerBridge || (options.maxTriggeredRequests ?? 100) <= 0) {
    return undefined;
  }
  const queued = await events.sessionRequestQueueConsumerBridge.claimNextRunnable(session.sessionid);
  if (!queued) {
    return undefined;
  }
  return launchTurnEndRequestChain(database, session.sessionid, {
    text: queued.text,
    attachments: queued.attachments,
    model: queued.model,
    queueClaim: {
      sessionid: queued.sessionid,
      itemid: queued.itemid
    }
  }, events, options, 1);
}

async function runTurnEndRequestChain(
  database: NDXDatabase,
  sessionid: string,
  request: NDXHookTurnEndRequestEffect,
  events: NDXTurnLoopEvents,
  options: { maxCompactContinuations?: number; maxTriggeredRequests?: number },
  requestNumber: number
): Promise<void> {
  const nextSession = await getSession(database, sessionid);
  if (!nextSession || nextSession.isrunning) {
    await releaseTurnEndRequestClaim(events, request);
    return;
  }
  if (request.queueClaim) {
    const completed = await events.sessionRequestQueueConsumerBridge?.completeClaim(request.queueClaim.sessionid, request.queueClaim.itemid);
    if (!completed) {
      database.logger?.warn("agent.turnloop.turn_end_request.claim_missing", {
        sessionid,
        itemid: request.queueClaim.itemid
      });
      return;
    }
  }
  const result = await runAgentTurnWithCompactContinuation(
    database,
    nextSession,
    { text: request.text, attachments: request.attachments ?? [] },
    request.model,
    events,
    { maxContinuations: options.maxCompactContinuations }
  );
  const nextRequest = result.turnEndHookResult?.effect.turnEndRequest;
  if (!nextRequest) {
    return;
  }
  if (requestNumber >= (options.maxTriggeredRequests ?? 100)) {
    await releaseTurnEndRequestClaim(events, nextRequest);
    database.logger?.warn("agent.turnloop.turn_end_request.limit_reached", {
      sessionid,
      maxTriggeredRequests: options.maxTriggeredRequests ?? 100
    });
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await runTurnEndRequestChain(database, sessionid, nextRequest, events, options, requestNumber + 1);
}

async function releaseTurnEndRequestClaim(events: NDXTurnLoopEvents, request: NDXHookTurnEndRequestEffect): Promise<void> {
  if (request.queueClaim) {
    await events.sessionRequestQueueConsumerBridge?.releaseClaim(request.queueClaim.sessionid, request.queueClaim.itemid);
  }
}

export { buildTurnMessages, buildTurnMessageParts, buildTurnMessagesFromParts } from "./base/context/index.js";
export { getRuntimeTurnPhase, requestRuntimeTurnInterrupt, turnInterruptPolicy } from "./base/interrupt/index.js";
export type { NDXTurnMessageParts } from "./base/context/index.js";
export type { NDXTurnInput, NDXTurnLoopEvents, NDXTurnLoopEvent, NDXTurnResult } from "./types.js";
export type { NDXTurnInterruptAction, NDXTurnPhase } from "./base/interrupt/index.js";

import { randomUUID } from "node:crypto";
import {
  NDX_SESSION_CLIENT_REQUEST,
  NDX_SESSION_CLIENT_REQUEST_CLOSED,
  NDX_SESSION_CLIENT_REQUEST_KIND_ASK_USER_QUESTION,
  NDX_SESSION_REQUEST_QUEUE_CHANGED,
  type NDXAgentLanguage,
  type NDXAgentResourceResolver,
  type NDXLogger
} from "ndx/common";
import type { NDXAskUserQuestionRequest, NDXAskUserQuestionResponse, NDXSessionClientRequestClosedMessage, NDXSessionRequestQueueChangedMessage } from "ndx/common/protocol";
import type { NDXDatabase } from "ndx/agent/init";
import { getSession, type NDXModelConfig, type NDXSessionRow } from "ndx/agent/session";
import {
  createNDXSessionRequestQueueRegistry,
  sessionRequestQueueItemForSocket,
  type NDXSessionRequestQueueConsumerBridge,
  type NDXSessionRequestQueueEditBridge
} from "ndx/agent/requestQue";
import {
  runQueuedAgentTurns,
  type NDXAfterResponseTriggerLaunch,
  type NDXTurnLoopEvents
} from "ndx/agent/turnloop";
import { sendJson } from "./sendJson.js";
import { sendTurnLoopEventToSessionGrantOwners, sessionGrantOwnerTargets } from "./socketMessages.js";
import type { SessionClientState } from "./types.js";

const pendingClientRequests = new Map<string, {
  sessionid: string;
  request: NDXAskUserQuestionRequest;
  finish: (response: NDXAskUserQuestionResponse | undefined, reason: NDXSessionClientRequestClosedMessage["reason"]) => void;
}>();

const sessionRequestQueues = createNDXSessionRequestQueueRegistry();
const runningQueuedSessionRequests = new Set<string>();

export function finishSessionClientResponse(
  sessionid: string,
  requestId: string,
  response: NDXAskUserQuestionResponse
): boolean {
  const pending = pendingClientRequests.get(requestId);
  if (!pending || pending.sessionid !== sessionid) {
    return false;
  }
  pending.finish(response, hasAskUserQuestionAnswers(response) ? "answered" : "cancelled");
  return true;
}

export function enqueueSessionRequest(input: Parameters<typeof sessionRequestQueues.enqueue>[0]): void {
  sessionRequestQueues.enqueue(input);
}

export function updateSessionRequest(input: Parameters<typeof sessionRequestQueues.update>[0]): void {
  sessionRequestQueues.update(input);
}

export function deleteSessionRequest(sessionid: string, itemid: string): void {
  sessionRequestQueues.delete(sessionid, itemid);
}

export function isQueuedSessionRequestRunning(sessionid: string): boolean {
  return runningQueuedSessionRequests.has(sessionid);
}

export function hasQueuedSessionRequests(sessionid: string): boolean {
  return sessionRequestQueues.hasItems(sessionid);
}

export function claimQueuedSessionRunGuard(sessionid: string): void {
  runningQueuedSessionRequests.add(sessionid);
}

export function releaseQueuedSessionGuardWhenLaunchFinishes(
  sessionid: string,
  launch: NDXAfterResponseTriggerLaunch | undefined,
  afterRelease?: () => void
): void {
  const release = () => {
    runningQueuedSessionRequests.delete(sessionid);
    afterRelease?.();
  };
  if (!launch) {
    release();
    return;
  }
  void launch.finished.finally(release);
}

export async function sendPendingClientRequestsForSession(client: SessionClientState, sessionid: string) {
  for (const [requestId, pending] of pendingClientRequests) {
    if (pending.sessionid === sessionid) {
      await sendClientRequest(client, sessionid, requestId, pending.request);
    }
  }
}

export function createSessionRequestQueueBridge(
  connectedClients: Map<string, SessionClientState>,
  logger?: NDXLogger,
  defaultModel?: NDXModelConfig
): NDXSessionRequestQueueEditBridge {
  return {
    list(sessionid) {
      return sessionRequestQueues.items(sessionid);
    },
    async add(input) {
      const model = input.model ?? defaultModel;
      if (!model) {
        throw new Error("session request queue add requires an assigned model.");
      }
      const item = sessionRequestQueues.insert({
        ...input,
        model,
        modelSource: input.modelSource ?? (input.model ? "client-selected" : "tool-default")
      });
      await broadcastSessionRequestQueueChanged(connectedClients, input.sessionid, logger);
      return sessionRequestQueueItemForSocket(item);
    },
    async updateText(sessionid, itemid, text) {
      const item = sessionRequestQueues.updateText(sessionid, itemid, text);
      await broadcastSessionRequestQueueChanged(connectedClients, sessionid, logger);
      return item ? sessionRequestQueueItemForSocket(item) : undefined;
    },
    async update(input) {
      const item = sessionRequestQueues.update(input);
      await broadcastSessionRequestQueueChanged(connectedClients, input.sessionid, logger);
      return item ? sessionRequestQueueItemForSocket(item) : undefined;
    },
    async delete(sessionid, itemid) {
      const deleted = sessionRequestQueues.delete(sessionid, itemid);
      await broadcastSessionRequestQueueChanged(connectedClients, sessionid, logger);
      return deleted;
    },
    async clear(sessionid) {
      sessionRequestQueues.clear(sessionid);
      await broadcastSessionRequestQueueChanged(connectedClients, sessionid, logger);
    }
  };
}

export function createSessionRequestQueueConsumerBridge(
  connectedClients: Map<string, SessionClientState>,
  logger?: NDXLogger
): NDXSessionRequestQueueConsumerBridge {
  return {
    async claimNextRunnable(sessionid) {
      const item = sessionRequestQueues.claimNextRunnable(sessionid);
      await broadcastSessionRequestQueueChanged(connectedClients, sessionid, logger);
      return item;
    },
    async releaseClaim(sessionid, itemid) {
      const released = sessionRequestQueues.releaseClaim(sessionid, itemid);
      await broadcastSessionRequestQueueChanged(connectedClients, sessionid, logger);
      return released;
    },
    async completeClaim(sessionid, itemid) {
      const completed = sessionRequestQueues.completeClaim(sessionid, itemid);
      await broadcastSessionRequestQueueChanged(connectedClients, sessionid, logger);
      return completed;
    }
  };
}

export async function startQueuedSessionRequests(
  connectedClients: Map<string, SessionClientState>,
  database: NDXDatabase,
  sourceSession: NDXSessionRow,
  language: NDXAgentLanguage | undefined,
  resource: NDXAgentResourceResolver,
  logger?: NDXLogger
) {
  if (runningQueuedSessionRequests.has(sourceSession.sessionid)) return;
  runningQueuedSessionRequests.add(sourceSession.sessionid);
  let launch: NDXAfterResponseTriggerLaunch | undefined;
  try {
    const session = await getSession(database, sourceSession.sessionid);
    if (!session) {
      sessionRequestQueues.clear(sourceSession.sessionid);
      await broadcastSessionRequestQueueChanged(connectedClients, sourceSession.sessionid, logger);
      return;
    }
    if (session.isrunning) return;
    launch = await runQueuedAgentTurns(
      database,
      session,
      sessionTurnLoopEvents(connectedClients, session, language, resource, logger)
    );
  } catch (error) {
    logger?.error("agent.socket.protocol.session_request_queue.run.failed", { sessionid: sourceSession.sessionid, error });
  } finally {
    releaseQueuedSessionGuardWhenLaunchFinishes(sourceSession.sessionid, launch, launch
      ? () => {
          if (sessionRequestQueues.hasItems(sourceSession.sessionid)) {
            void startQueuedSessionRequests(connectedClients, database, sourceSession, language, resource, logger);
          }
        }
      : undefined);
  }
}

export function sessionTurnLoopEvents(
  connectedClients: Map<string, SessionClientState>,
  session: NDXSessionRow,
  language: NDXAgentLanguage | undefined,
  resource: NDXAgentResourceResolver,
  logger?: NDXLogger
): NDXTurnLoopEvents {
  return {
    language,
    resource,
    sessionClientBridge: {
      requestUserQuestion(request, bridgeOptions) {
        return requestSessionClientQuestion(connectedClients, session.sessionid, { ...request, sessionid: session.sessionid }, bridgeOptions?.signal, logger);
      }
    },
    sessionRequestQueueBridge: createSessionRequestQueueBridge(connectedClients, logger, session.model),
    sessionRequestQueueConsumerBridge: createSessionRequestQueueConsumerBridge(connectedClients, logger),
    async onEvent(event) {
      await sendTurnLoopEventToSessionGrantOwners(connectedClients, session, event, logger);
    },
    async onSubsessionEvent(subsession, event) {
      await sendTurnLoopEventToSessionGrantOwners(connectedClients, subsession, event, logger);
    }
  };
}

export async function broadcastSessionRequestQueueChanged(
  connectedClients: Map<string, SessionClientState>,
  sessionid: string,
  logger?: NDXLogger
) {
  const targets = sessionGrantOwnerTargets(connectedClients, sessionid);
  await Promise.all(targets.map((target) => sendSessionRequestQueueChanged(target.client, sessionid)));
  logger?.debug("agent.socket.session_request_queue.changed.broadcast", { sessionid, count: targets.length });
}

export async function sendSessionRequestQueueChanged(client: SessionClientState, sessionid: string) {
  await sendJson(client, {
    type: NDX_SESSION_REQUEST_QUEUE_CHANGED,
    sessionid,
    items: sessionRequestQueues.items(sessionid),
    language: client.language
  } satisfies NDXSessionRequestQueueChangedMessage);
}

async function requestSessionClientQuestion(
  connectedClients: Map<string, SessionClientState>,
  sessionid: string,
  request: NDXAskUserQuestionRequest,
  signal?: AbortSignal,
  logger?: NDXLogger
): Promise<NDXAskUserQuestionResponse | undefined> {
  const requestId = randomUUID();
  const targets: SessionClientState[] = [];
  for (const client of connectedClients.values()) {
    if (client.grants.has(sessionid)) {
      targets.push(client);
    }
  }
  if (targets.length === 0) {
    logger?.warn("agent.socket.client_request.ask_user_question.waiting_for_client", { sessionid, toolCallId: request.toolCallId });
  }

  return new Promise((resolve) => {
    let abort: (() => void) | undefined;
    const finish = (response: NDXAskUserQuestionResponse | undefined, reason: NDXSessionClientRequestClosedMessage["reason"]) => {
      pendingClientRequests.delete(requestId);
      if (abort) signal?.removeEventListener("abort", abort);
      void broadcastClientRequestClosed(connectedClients, sessionid, requestId, reason);
      resolve(response);
    };
    abort = () => finish(undefined, "interrupted");
    if (signal?.aborted) {
      resolve(undefined);
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    pendingClientRequests.set(requestId, { sessionid, request, finish });
    for (const target of targets) {
      void sendClientRequest(target, sessionid, requestId, request);
    }
  });
}

async function sendClientRequest(client: SessionClientState, sessionid: string, requestId: string, request: NDXAskUserQuestionRequest) {
  await sendJson(client, {
    type: NDX_SESSION_CLIENT_REQUEST,
    requestId,
    sessionid,
    request,
    language: client.language
  });
}

async function broadcastClientRequestClosed(
  connectedClients: Map<string, SessionClientState>,
  sessionid: string,
  requestId: string,
  reason: NDXSessionClientRequestClosedMessage["reason"]
) {
  const targets: SessionClientState[] = [];
  for (const client of connectedClients.values()) {
    if (client.grants.has(sessionid)) {
      targets.push(client);
    }
  }
  await Promise.all(targets.map((target) => sendJson(target, {
    type: NDX_SESSION_CLIENT_REQUEST_CLOSED,
    requestId,
    sessionid,
    requestKind: NDX_SESSION_CLIENT_REQUEST_KIND_ASK_USER_QUESTION,
    reason,
    language: target.language
  })));
}

function hasAskUserQuestionAnswers(response: NDXAskUserQuestionResponse): boolean {
  return Object.values(response.answers).some((answer) => answer.answers.length > 0 || Boolean(answer.attachments?.length));
}

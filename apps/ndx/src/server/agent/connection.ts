import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import {
  NDX_PROTOCOL_ERROR,
  NDX_SESSION_ATTACHED,
  NDX_SESSION_BRANCH_CREATED,
  NDX_SESSION_CREATED,
  NDX_SESSION_DELETED,
  NDX_SESSION_EVENT,
  NDX_SESSION_HISTORY_SUMMARY_RESULT,
  NDX_SESSION_INPUT,
  NDX_SESSION_ITERATION_DETAIL_RESULT,
  NDX_SESSION_LIST_CHANGED,
  NDX_SESSION_RENAMED,
  NDX_SESSION_SIDEBAR_ITEM,
  NDX_SESSION_SKILL_LIST_RESULT,
  NDX_SESSION_TURN_DETAIL_RESULT,
  NDX_SESSION_TURN_DELETED,
  NDX_TURN_EVENT,
  NDX_AGENT_RESOURCE,
  createNDXAgentResourceResolver,
  normalizeNDXAgentLanguage,
  type NDXAgentResourceResolver,
  isNDXSessionAttachMessage,
  isNDXSessionBranchCreateMessage,
  isNDXSessionCreateMessage,
  isNDXSessionDeleteMessage,
  isNDXSessionTurnDeleteMessage,
  isNDXSessionHistorySummaryMessage,
  isNDXSessionInputMessage,
  isNDXSessionIterationDetailMessage,
  isNDXSessionInterruptMessage,
  isNDXSessionClientResponseMessage,
  isNDXSessionRenameMessage,
  isNDXSessionSkillListMessage,
  isNDXSessionTurnDetailMessage,
  NDX_SESSION_CLIENT_REQUEST,
  NDX_SESSION_CLIENT_REQUEST_CLOSED,
  NDX_SESSION_CLIENT_REQUEST_KIND_ASK_USER_QUESTION
} from "ndx/common";
import type { NDXAskUserQuestionRequest, NDXAskUserQuestionResponse, NDXSessionAttachMessage, NDXSessionBranchCreateMessage, NDXSessionClientRequestClosedMessage, NDXSessionCreateInitialInput, NDXSessionCreateMessage, NDXSessionDeleteMessage, NDXSessionEventMessage, NDXSessionRenameMessage, NDXSessionSidebarItemMessage, NDXSessionSkillListMessage, NDXSessionTurnDeleteMessage } from "ndx/common/protocol";
import {
  appendSessionData,
  branchSessionFromTurn,
  createSession,
  deleteSession,
  deleteSessionTurn,
  getSession,
  getRuntimeTurnPhase,
  interruptContents,
  loadSkills,
  completeSessionInterrupt,
  requestRuntimeTurnInterrupt,
  requestSessionInterrupt,
  assertModelSupportsAttachments,
  userMessageContents,
  sessionDataTitleText,
  updateSessionTitle,
  writeSessionAttachments,
  type NDXDatabase,
  type NDXModelConfig,
  type NDXSessionDataRow,
  type NDXSessionRow,
  type NDXTurnLoopEvent,
  runAgentTurn
} from "ndx/agent";
import type { NDXLogger } from "ndx/common";
import { serverContainerUserHome, serverWorkspaceProjectPath, toServerProjectPath } from "ndx/common/server-path";
import type { RawData, WebSocket } from "ws";
import { acceptAccountSelection, requireAccountSelection } from "./accountSelection.js";
import { buildSessionHistorySummary, buildSessionIterationDetail, buildSessionTurnDetail } from "./history.js";
import { acceptProjectNegotiation } from "./projectNegotiation.js";
import { sendJson } from "./sendJson.js";
import type { SessionClientState } from "./types.js";

const pendingClientRequests = new Map<string, {
  sessionid: string;
  request: NDXAskUserQuestionRequest;
  finish: (response: NDXAskUserQuestionResponse | undefined, reason: NDXSessionClientRequestClosedMessage["reason"]) => void;
}>();

export async function handleSessionConnection(
  socket: WebSocket,
  clientid: string,
  connectedClients: Map<string, SessionClientState>,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  const connectionKey = randomUUID();
  const client: SessionClientState = {
    clientid,
    socket,
    grants: new Map(),
    missedPings: 0,
    pongSinceLastPing: true
  };
  connectedClients.set(connectionKey, client);
  logger?.info("agent.socket.connection.open", { clientid, connectedCount: connectedClients.size });

  socket.on("pong", () => {
    client.missedPings = 0;
    client.pongSinceLastPing = true;
    logger?.debug("agent.socket.heartbeat.pong", { clientid });
  });

  socket.on("message", (data) => {
    logger?.debug("agent.socket.message.received", { clientid, bytes: data.toString("utf8").length });
    void handleSessionMessage(client, data, connectedClients, database, logger, resource).catch((error) => {
      logger?.error("agent.socket.message.failed", { clientid, error });
    });
  });

  socket.on("close", () => {
    connectedClients.delete(connectionKey);
    logger?.info("agent.socket.connection.close", { clientid, connectedCount: connectedClients.size });
  });

  socket.on("error", (error) => {
    logger?.error("agent.socket.connection.error", { clientid, error });
  });

  await requireAccountSelection(client, database, undefined, logger);
}

async function handleSessionMessage(
  client: SessionClientState,
  data: RawData,
  connectedClients: Map<string, SessionClientState>,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  let message: unknown;
  try {
    message = JSON.parse(data.toString("utf8"));
  } catch {
    logger?.warn("agent.socket.protocol.invalid_json", { clientid: client.clientid });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_INVALID_JSON_ERROR, { language: client.language }) });
    return;
  }
  const language = normalizeNDXAgentLanguage((message as { language?: unknown })?.language, client.language);
  client.language = language;

  if (isNDXSessionAttachMessage(message)) {
    await attachSessionGrant(client, message, database, logger, resource);
    return;
  }

  if (isNDXSessionSkillListMessage(message) && message.sessionid) {
    await sendSkillListFromSocket(client, message, database, logger, resource);
    return;
  }

  if (isNDXSessionClientResponseMessage(message)) {
    const grant = await requireSessionGrant(client, message.sessionid, logger, resource);
    const pending = pendingClientRequests.get(message.requestId);
    if (!grant || !pending || grant.sessionid !== pending.sessionid) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_UNAVAILABLE_ERROR, { language }) });
      return;
    }
    pending.finish(message.response, hasAskUserQuestionAnswers(message.response) ? "answered" : "cancelled");
    return;
  }

  if (!client.userid) {
    logger?.info("agent.socket.protocol.account_selection", { clientid: client.clientid, messageType: messageType(message) });
    await acceptAccountSelection(client, message, database, logger, resource);
    return;
  }

  if (isNDXSessionInputMessage(message)) {
    logger?.info("agent.socket.protocol.session_input.start", {
      clientid: client.clientid,
      sessionid: message.sessionid,
      textLength: message.text.length,
      attachmentCount: message.attachments?.length ?? 0
    });
    const grant = await requireSessionGrant(client, message.sessionid, logger, resource);
    if (!grant) {
      return;
    }
    const session = await getSession(database, grant.sessionid);
    if (!session) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_UNAVAILABLE_ERROR, { language }) });
      return;
    }
    if (session.isrunning) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_ALREADY_RUNNING_ERROR, { language }) });
      return;
    }

    const turnModel = message.model ?? session.model;
    let attachments;
    try {
      assertModelSupportsAttachments(turnModel, message.attachments);
      attachments = await writeSessionAttachments(toServerProjectPath(session.path), session.sessionid, message.attachments);
    } catch (error) {
      logger?.warn("agent.socket.protocol.session_input.attachment_rejected", { clientid: client.clientid, sessionid: session.sessionid, error });
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_UNSUPPORTED_SESSION_MESSAGE_ERROR, { language }) });
      return;
    }

    await runAgentTurn(database, session, { text: message.text.trim(), attachments }, message.model, {
      language,
      resource,
      sessionClientBridge: {
        requestUserQuestion(request, bridgeOptions) {
          return requestSessionClientQuestion(connectedClients, session.sessionid, { ...request, sessionid: session.sessionid }, bridgeOptions?.signal, logger);
        }
      },
      async onEvent(event) {
        await sendTurnLoopEventToSessionGrantOwners(connectedClients, session, event, logger);
      }
    });
    logger?.info("agent.socket.protocol.session_input.complete", {
      clientid: client.clientid,
      sessionid: session.sessionid
    });
    return;
  }

  if (isNDXSessionSkillListMessage(message)) {
    await sendSkillListFromSocket(client, message, database, logger, resource);
    return;
  }

  if (isNDXSessionHistorySummaryMessage(message)) {
    const grant = await requireSessionGrant(client, message.sessionid, logger, resource);
    if (!grant) return;
    const session = await getSession(database, grant.sessionid);
    if (!session) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_UNAVAILABLE_ERROR, { language }) });
      return;
    }
    const history = await buildSessionHistorySummary(database, session);
    await sendJson(client, {
      type: NDX_SESSION_HISTORY_SUMMARY_RESULT,
      sessionid: grant.sessionid,
      ...history
    });
    return;
  }

  if (isNDXSessionTurnDetailMessage(message)) {
    const grant = await requireSessionGrant(client, message.sessionid, logger, resource);
    if (!grant) return;
    await sendJson(client, {
      type: NDX_SESSION_TURN_DETAIL_RESULT,
      sessionid: grant.sessionid,
      turn: await buildSessionTurnDetail(database, grant.sessionid, message.inputDataId)
    });
    return;
  }

  if (isNDXSessionIterationDetailMessage(message)) {
    const grant = await requireSessionGrant(client, message.sessionid, logger, resource);
    if (!grant) return;
    await sendJson(client, {
      type: NDX_SESSION_ITERATION_DETAIL_RESULT,
      sessionid: grant.sessionid,
      inputDataId: message.inputDataId,
      iteration: message.iteration,
      events: await buildSessionIterationDetail(database, grant.sessionid, message.inputDataId, message.iteration)
    });
    return;
  }

  if (isNDXSessionInterruptMessage(message)) {
    logger?.info("agent.socket.protocol.session_interrupt.start", { clientid: client.clientid, sessionid: message.sessionid });
    const grant = await requireSessionGrant(client, message.sessionid, logger, resource);
    if (!grant) {
      return;
    }
    const session = await getSession(database, grant.sessionid);
    if (!session) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_UNAVAILABLE_ERROR, { language }) });
      return;
    }
    if (session.turnphase === "compacting") {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: "세션 히스토리 compact가 진행 중입니다. 완료 후 다시 시도하세요." });
      return;
    }
    const runtimePhase = getRuntimeTurnPhase(session.sessionid);
    if (!session.isrunning && !runtimePhase) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: "세션이 실행 중이 아닙니다." });
      return;
    }

    const data = await appendSessionData(database, session.sessionid, "interrupt", interruptContents(new Date().toISOString()));
    const interruptedSession = await requestSessionInterrupt(database, session.sessionid, runtimePhase);
    const interrupt = requestRuntimeTurnInterrupt(session.sessionid);
    await sendJson(client, {
      type: NDX_SESSION_EVENT,
      sessionid: session.sessionid,
      event: NDX_TURN_EVENT.Interrupted,
      dataid: `interrupt-start:${session.sessionid}:${Date.now()}`,
      contents: {
        kind: "interrupt_started",
        runtime: interrupt,
        turnphase: interruptedSession.turnphase,
        interruptrequestedat: interruptedSession.interruptrequestedat?.toISOString()
      },
      createdat: new Date().toISOString()
    });
    if (!interrupt.accepted) {
      await completeSessionInterrupt(database, session.sessionid);
    }
    await sendJson(client, {
      type: NDX_SESSION_EVENT,
      sessionid: session.sessionid,
      event: NDX_TURN_EVENT.Interrupted,
      dataid: String(data.dataid),
      contents: { ...(data.contents && typeof data.contents === "object" ? data.contents : {}), interrupt },
      createdat: data.createdat.toISOString()
    });
    logger?.info("agent.socket.protocol.session_interrupt.complete", {
      clientid: client.clientid,
      sessionid: session.sessionid,
      dataid: String(data.dataid)
    });
    return;
  }

  if (isNDXSessionDeleteMessage(message)) {
    await deleteSessionFromSocket(client, message, connectedClients, database, logger, resource);
    return;
  }

  if (isNDXSessionTurnDeleteMessage(message)) {
    await deleteSessionTurnFromSocket(client, message, connectedClients, database, logger, resource);
    return;
  }

  if (isNDXSessionBranchCreateMessage(message)) {
    await createSessionBranchFromSocket(client, message, connectedClients, database, logger, resource);
    return;
  }

  if (isNDXSessionRenameMessage(message)) {
    await renameSessionFromSocket(client, message, connectedClients, database, logger, resource);
    return;
  }

  if (!client.projectName) {
    logger?.info("agent.socket.protocol.project_negotiation", {
      clientid: client.clientid,
      userid: client.userid,
      messageType: messageType(message)
    });
    await acceptProjectNegotiation(client, message, database, logger, resource);
    return;
  }

  if (isNDXSessionCreateMessage(message)) {
    logger?.info("agent.socket.protocol.session_create.start", {
      clientid: client.clientid,
      userid: message.userid ?? client.userid,
      projectName: message.projectName ?? client.projectName,
      model: message.model?.model
    });
    const input = await resolveCreateSessionInput(client, message, database, logger, resource);
    if (!input) {
      return;
    }
    const initialInput = message.initialInput;
    if (initialInput) {
      try {
        assertModelSupportsAttachments(input.model, initialInput.attachments);
        assertSessionInputAttachmentBytes(initialInput.attachments);
      } catch (error) {
        logger?.warn("agent.socket.protocol.session_create.initial_input_rejected", { clientid: client.clientid, error });
        await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_UNSUPPORTED_SESSION_MESSAGE_ERROR, { language }) });
        return;
      }
      (input as { title?: string }).title = sessionDataTitleText({ type: "user", contents: userMessageContents(initialInput.text.replace(/\[\[NDX_THINKING_(none|nothink|normal|high|low|medium)\]\]/g, "").trim()) }) ?? "";
    }
    const session = await createSession(database, input);
    client.grants.set(session.sessionid, {
      sessionid: session.sessionid,
      userid: session.userid,
      projectName: session.projectname,
      createdat: new Date()
    });
    await sendJson(client, {
      type: NDX_SESSION_CREATED,
      ...(initialInput ? { initialInputAccepted: true } : {}),
      ...toSocketSession(session)
    });
    await broadcastSessionListChanged(connectedClients, session.userid, session.projectname, logger);
    if (initialInput) {
      await handleSessionMessage(
        client,
        Buffer.from(JSON.stringify({
          type: NDX_SESSION_INPUT,
          sessionid: session.sessionid,
          text: initialInput.text,
          ...(initialInput.attachments?.length ? { attachments: initialInput.attachments } : {}),
          model: input.model,
          language
        })),
        connectedClients,
        database,
        logger,
        resource
      );
    }
    logger?.info("agent.socket.protocol.session_create.complete", { clientid: client.clientid, sessionid: session.sessionid });
    return;
  }

  logger?.warn("agent.socket.protocol.unsupported_message", { clientid: client.clientid, messageType: messageType(message) });
  await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_UNSUPPORTED_SESSION_MESSAGE_ERROR, { language }) });
}

export function sessionSidebarItemSocketMessage(
  session: Pick<NDXSessionRow, "sessionid">,
  event: Extract<NDXTurnLoopEvent, { type: typeof NDX_TURN_EVENT.SidebarItem }>
): NDXSessionSidebarItemMessage {
  return {
    type: NDX_SESSION_SIDEBAR_ITEM,
    sessionid: session.sessionid,
    item: event.item,
    tool: event.tool,
    callId: event.callId,
    createdat: new Date().toISOString()
  };
}

type SessionGrantOwnerTarget = {
  client: SessionClientState;
};

type NDXSessionGrantOwnerMessage = NDXSessionEventMessage | NDXSessionSidebarItemMessage;

type TurnLoopEventSocketContext = {
  session: NDXSessionRow;
  now: string;
  timeKey: number;
};

type TurnLoopEventSocketSerializerMap = {
  [K in NDXTurnLoopEvent["type"]]: (event: Extract<NDXTurnLoopEvent, { type: K }>, context: TurnLoopEventSocketContext) => NDXSessionGrantOwnerMessage[];
};

const TURN_LOOP_EVENT_SOCKET_SERIALIZERS: TurnLoopEventSocketSerializerMap = {
  [NDX_TURN_EVENT.InputRecorded]: (event, context) => [sessionEventSocketMessage(context.session, event.type, String(event.input.dataid), socketSessionEventContents(event.input.contents), event.input.createdat.toISOString(), event.contextUsage)],
  [NDX_TURN_EVENT.ContextReady]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `context-ready:${context.session.sessionid}:${context.timeKey}`, { kind: "context_ready", messageCount: event.messageCount }, context.now, event.contextUsage)],
  [NDX_TURN_EVENT.CompactStarted]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `compact-start:${context.session.sessionid}:${context.timeKey}`, { kind: "compact_started", ...event.report }, context.now, event.contextUsage)],
  [NDX_TURN_EVENT.CompactCompleted]: (event, context) => [sessionEventSocketMessage(context.session, event.type, String(event.compact.dataid), { kind: "compact_completed", ...event.report, compactDataId: String(event.compact.dataid), sourceRowCount: event.sourceRowCount, summaryTokens: event.summaryTokens }, event.compact.createdat.toISOString(), event.contextUsage)],
  [NDX_TURN_EVENT.ModelRequest]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `model:${context.session.sessionid}:${event.iteration}`, { kind: "model_request", iteration: event.iteration, messageCount: event.messages.length }, context.now, event.contextUsage)],
  [NDX_TURN_EVENT.PrefixDrift]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `prefix-drift:${context.session.sessionid}:${event.iteration}:${context.timeKey}`, { kind: "prefix_drift", iteration: event.iteration, ...event.drift }, context.now, event.contextUsage)],
  [NDX_TURN_EVENT.ModelProgress]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `model-progress:${context.session.sessionid}:${event.iteration}:${Math.floor(event.elapsedMs / event.intervalMs)}`, { kind: "model_progress", iteration: event.iteration, elapsedMs: event.elapsedMs, intervalMs: event.intervalMs, message: event.message }, context.now, event.contextUsage)],
  [NDX_TURN_EVENT.ModelResume]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `model-resume:${context.session.sessionid}:${event.iteration}`, { kind: "model_request_resuming", iteration: event.iteration, results: event.results.map((result) => ({ tool: result.tool, callId: result.callId, status: result.status, success: result.success })) }, context.now, event.contextUsage)],
  [NDX_TURN_EVENT.AssistantDelta]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `stream:${context.session.sessionid}:${event.iteration}`, { kind: "assistant_delta", iteration: event.iteration, delta: event.delta, content: event.content }, context.now, event.contextUsage)],
  [NDX_TURN_EVENT.AssistantReasoning]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `reasoning:${context.session.sessionid}:${event.iteration}`, { kind: "assistant_reasoning", iteration: event.iteration, summary: event.summary }, context.now, event.contextUsage)],
  [NDX_TURN_EVENT.ToolCallRecorded]: (event, context) => [sessionEventSocketMessage(context.session, event.type, String(event.data.dataid), socketSessionEventContents(event.data.contents), event.data.createdat.toISOString(), event.contextUsage)],
  [NDX_TURN_EVENT.ToolBatchStarted]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `tool-batch:${context.session.sessionid}:${event.iteration}`, { kind: "tool_batch", iteration: event.iteration, toolCalls: event.toolCalls }, context.now, event.contextUsage)],
  [NDX_TURN_EVENT.ToolProgress]: (event, context) => [toolProgressSocketMessage(event, context)],
  [NDX_TURN_EVENT.SidebarItem]: (event, context) => [sessionSidebarItemSocketMessage(context.session, event)],
  [NDX_TURN_EVENT.CotWork]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `cot-work:${context.session.sessionid}:${event.iteration}:${event.callId ?? event.tool}:${context.timeKey}`, event.contents, context.now, event.contextUsage)],
  [NDX_TURN_EVENT.ToolResultRecorded]: (event, context) => [sessionEventSocketMessage(context.session, event.type, String(event.data.dataid), socketSessionEventContents(event.data.contents), event.data.createdat.toISOString(), event.contextUsage)],
  [NDX_TURN_EVENT.Interrupted]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `turn-interrupted:${context.session.sessionid}:${context.timeKey}`, { kind: "turn_interrupted", phase: event.phase }, context.now, event.contextUsage)],
  [NDX_TURN_EVENT.InterruptCompleted]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `interrupt-completed:${context.session.sessionid}:${context.timeKey}`, { kind: "interrupt_completed", phase: event.phase, session: toSocketSession(event.session) }, context.now, event.contextUsage)],
  [NDX_TURN_EVENT.AssistantRecorded]: (event, context) => [sessionEventSocketMessage(context.session, event.type, String(event.assistant.dataid), socketSessionEventContents(event.assistant.contents), event.assistant.createdat.toISOString(), event.contextUsage)],
  [NDX_TURN_EVENT.TurnEnd]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `turn-end:${context.session.sessionid}:${event.iteration}:${context.timeKey}`, { kind: "turn_end", iteration: event.iteration, session: toSocketSession(event.session) }, context.now, event.contextUsage)]
};

async function sendTurnLoopEventToSessionGrantOwners(
  connectedClients: Map<string, SessionClientState>,
  session: NDXSessionRow,
  event: NDXTurnLoopEvent,
  logger?: NDXLogger
) {
  const targets = sessionGrantOwnerTargets(connectedClients, session.sessionid);
  await Promise.all(targets.flatMap((target) => {
    const context = {
      session,
      now: new Date().toISOString(),
      timeKey: Date.now()
    };
    return sessionSocketMessagesFromTurnLoopEvent(event, context).map((message) => sendJson(target.client, message));
  }));
  logger?.debug("agent.socket.session_grant_owners.turn_event.sent", { sessionid: session.sessionid, event: event.type, count: targets.length });
}

export function sessionSocketMessagesFromTurnLoopEvent(event: NDXTurnLoopEvent, context: TurnLoopEventSocketContext): NDXSessionGrantOwnerMessage[] {
  const serialize = TURN_LOOP_EVENT_SOCKET_SERIALIZERS[event.type] as (event: NDXTurnLoopEvent, context: TurnLoopEventSocketContext) => NDXSessionGrantOwnerMessage[];
  return serialize(event, context);
}

export function sessionGrantOwnerTargets(connectedClients: Map<string, SessionClientState>, sessionid: string): SessionGrantOwnerTarget[] {
  const targets: SessionGrantOwnerTarget[] = [];
  for (const client of connectedClients.values()) {
    if (client.grants.has(sessionid)) {
      targets.push({ client });
    }
  }
  return targets;
}

function sessionEventSocketMessage(
  session: Pick<NDXSessionRow, "sessionid">,
  event: NDXSessionEventMessage["event"],
  dataid: string,
  contents: NDXSessionEventMessage["contents"],
  createdat: string,
  contextUsage: NDXSessionEventMessage["contextUsage"]
): NDXSessionEventMessage {
  return {
    type: NDX_SESSION_EVENT,
    sessionid: session.sessionid,
    event,
    dataid,
    contents,
    createdat,
    contextUsage
  };
}

function toolProgressSocketMessage(
  event: Extract<NDXTurnLoopEvent, { type: typeof NDX_TURN_EVENT.ToolProgress }>,
  context: TurnLoopEventSocketContext
): NDXSessionEventMessage {
  if (event.status === "started") {
    return sessionEventSocketMessage(context.session, event.type, `tool-start:${context.session.sessionid}:${event.iteration}:${event.callId ?? event.tool}`, { kind: "tool_started", iteration: event.iteration, tool: event.tool, callId: event.callId, args: event.args, startedAt: event.startedAt, status: event.status }, context.now, event.contextUsage);
  }
  if (event.status === "progress") {
    return sessionEventSocketMessage(context.session, event.type, `tool-progress:${context.session.sessionid}:${event.iteration}:${event.callId ?? event.tool}:${context.timeKey}`, { kind: "tool_progress", iteration: event.iteration, tool: event.tool, callId: event.callId, event: event.event, receivedAt: event.receivedAt, status: event.status }, context.now, event.contextUsage);
  }
  if (event.status === "finished") {
    return sessionEventSocketMessage(context.session, event.type, `tool-finish:${context.session.sessionid}:${event.iteration}:${event.result.callId ?? event.result.tool}`, { kind: "tool_finished", iteration: event.iteration, result: event.result, status: event.status }, context.now, event.contextUsage);
  }
  return sessionEventSocketMessage(context.session, event.type, `tool-interrupt:${context.session.sessionid}:${event.iteration}:${event.callId ?? event.tool}:${context.timeKey}`, {
    kind: "tool_interrupt",
    iteration: event.iteration,
    tool: event.tool,
    callId: event.callId,
    phase: event.phase,
    status: event.status,
    signal: event.signal,
    receivedAt: event.receivedAt
  }, context.now, event.contextUsage);
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

async function sendPendingClientRequestsForSession(client: SessionClientState, sessionid: string) {
  for (const [requestId, pending] of pendingClientRequests) {
    if (pending.sessionid === sessionid) {
      await sendClientRequest(client, sessionid, requestId, pending.request);
    }
  }
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

function assertSessionInputAttachmentBytes(attachments: NDXSessionCreateInitialInput["attachments"] = []): void {
  for (const attachment of attachments) {
    if (Buffer.from(attachment.data, "base64").length !== attachment.size) {
      throw new Error(`Attachment size mismatch: ${attachment.name}`);
    }
  }
}

async function resolveCreateSessionInput(
  client: SessionClientState,
  message: NDXSessionCreateMessage,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  const userid = message.userid ?? client.userid;
  const projectName = message.projectName ?? client.projectName;
  if (!userid || !projectName) {
    logger?.warn("agent.socket.protocol.session_create.rejected", { clientid: client.clientid, reason: "missing_project" });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_CREATE_TARGET_REQUIRED_ERROR, { language: client.language }) });
    return undefined;
  }
  const stat = await fs.stat(serverWorkspaceProjectPath(projectName)).catch(() => undefined);
  if (!stat?.isDirectory()) {
    logger?.warn("agent.socket.protocol.session_create.rejected", { clientid: client.clientid, reason: "missing_project", projectName });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_CREATE_TARGET_REQUIRED_ERROR, { language: client.language }) });
    return undefined;
  }

  return {
    userid,
    projectname: projectName,
    model: message.model ?? defaultModelConfig()
  };
}

async function sendSkillListFromSocket(
  client: SessionClientState,
  message: NDXSessionSkillListMessage,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  let projectName = client.projectName;
  if (message.sessionid) {
    const grant = await requireSessionGrant(client, message.sessionid, logger, resource);
    if (!grant) {
      return;
    }
    projectName = grant.projectName;
  }
  if (!projectName) {
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SKILL_LIST_PROJECT_REQUIRED_ERROR, { language: client.language }) });
    return;
  }
  const projectHome = serverWorkspaceProjectPath(projectName);
  const skills = await loadSkills({ userHome: serverContainerUserHome(), projectHome, cwd: projectHome });
  await sendJson(client, {
    type: NDX_SESSION_SKILL_LIST_RESULT,
    projectName,
    skills: skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      scope: skill.scope
    }))
  });
}

async function renameSessionFromSocket(
  client: SessionClientState,
  message: NDXSessionRenameMessage,
  connectedClients: Map<string, SessionClientState>,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  logger?.info("agent.socket.protocol.session_rename.start", {
    clientid: client.clientid,
    userid: message.userid,
    projectName: message.projectName,
    sessionid: message.sessionid,
    titleLength: message.title.trim().length
  });
  const session = await getSession(database, message.sessionid);
  if (!session || session.userid !== message.userid || session.projectname !== message.projectName) {
    logger?.warn("agent.socket.protocol.session_rename.rejected", { clientid: client.clientid, sessionid: message.sessionid });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_RENAME_UNAVAILABLE_ERROR, { language: client.language }) });
    return;
  }

  try {
    const renamed = await updateSessionTitle(database, message.sessionid, message.title.trim());
    await sendJson(client, {
      type: NDX_SESSION_RENAMED,
      ...toSocketSession(renamed)
    });
    await broadcastSessionListChanged(connectedClients, renamed.userid, renamed.projectname, logger);
    logger?.info("agent.socket.protocol.session_rename.complete", { clientid: client.clientid, sessionid: renamed.sessionid });
  } catch (error) {
    logger?.warn("agent.socket.protocol.session_rename.failed", { clientid: client.clientid, sessionid: message.sessionid, error });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_RENAME_FAILED_ERROR, { language: client.language }) });
  }
}

async function deleteSessionFromSocket(
  client: SessionClientState,
  message: NDXSessionDeleteMessage,
  connectedClients: Map<string, SessionClientState>,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  logger?.info("agent.socket.protocol.session_delete.start", {
    clientid: client.clientid,
    userid: message.userid,
    projectName: message.projectName,
    sessionid: message.sessionid
  });
  const session = await getSession(database, message.sessionid);
  if (!session || session.userid !== message.userid || session.projectname !== message.projectName) {
    logger?.warn("agent.socket.protocol.session_delete.rejected", { clientid: client.clientid, sessionid: message.sessionid });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_DELETE_UNAVAILABLE_ERROR, { language: client.language }) });
    return;
  }

  let deleted: NDXSessionRow | undefined;
  try {
    deleted = await deleteSession(database, message.sessionid);
  } catch (error) {
    logger?.warn("agent.socket.protocol.session_delete.failed", { clientid: client.clientid, sessionid: message.sessionid, error });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_DELETE_FAILED_ERROR, { language: client.language }) });
    return;
  }
  if (!deleted) {
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_DELETE_UNAVAILABLE_ERROR, { language: client.language }) });
    return;
  }
  for (const target of connectedClients.values()) {
    target.grants.delete(message.sessionid);
  }
  await sendJson(client, {
    type: NDX_SESSION_DELETED,
    sessionid: deleted.sessionid,
    userid: deleted.userid,
    projectname: deleted.projectname
  });
  await broadcastSessionListChanged(connectedClients, deleted.userid, deleted.projectname, logger);
  logger?.info("agent.socket.protocol.session_delete.complete", { clientid: client.clientid, sessionid: deleted.sessionid });
}

async function deleteSessionTurnFromSocket(
  client: SessionClientState,
  message: NDXSessionTurnDeleteMessage,
  connectedClients: Map<string, SessionClientState>,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  logger?.info("agent.socket.protocol.session_turn_delete.start", {
    clientid: client.clientid,
    sessionid: message.sessionid,
    inputDataId: message.inputDataId
  });
  const grant = await requireSessionGrant(client, message.sessionid, logger, resource);
  if (!grant) return;

  let deleted;
  try {
    deleted = await deleteSessionTurn(database, grant.sessionid, message.inputDataId);
  } catch (error) {
    logger?.warn("agent.socket.protocol.session_turn_delete.failed", { clientid: client.clientid, sessionid: message.sessionid, error });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: error instanceof Error ? error.message : "세션 턴을 삭제하지 못했습니다." });
    return;
  }
  if (!deleted) {
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: "삭제할 세션 턴을 찾지 못했습니다." });
    return;
  }

  await Promise.all(sessionGrantOwnerTargets(connectedClients, deleted.session.sessionid).map((target) => sendJson(target.client, {
    type: NDX_SESSION_TURN_DELETED,
    sessionid: deleted.session.sessionid,
    inputDataId: deleted.inputDataId,
    deletedDataIds: deleted.deletedDataIds
  })));
  await broadcastSessionListChanged(connectedClients, deleted.session.userid, deleted.session.projectname, logger);
  logger?.info("agent.socket.protocol.session_turn_delete.complete", { clientid: client.clientid, sessionid: deleted.session.sessionid, deletedCount: deleted.deletedDataIds.length });
}

async function createSessionBranchFromSocket(
  client: SessionClientState,
  message: NDXSessionBranchCreateMessage,
  connectedClients: Map<string, SessionClientState>,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  logger?.info("agent.socket.protocol.session_branch_create.start", {
    clientid: client.clientid,
    sessionid: message.sessionid,
    inputDataId: message.inputDataId
  });
  const grant = await requireSessionGrant(client, message.sessionid, logger, resource);
  if (!grant) return;

  let branch;
  try {
    branch = await branchSessionFromTurn(database, grant.sessionid, message.inputDataId);
  } catch (error) {
    logger?.warn("agent.socket.protocol.session_branch_create.failed", { clientid: client.clientid, sessionid: message.sessionid, error });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: error instanceof Error ? error.message : "세션 분기를 생성하지 못했습니다." });
    return;
  }
  if (!branch) {
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: "분기할 세션 턴을 찾지 못했습니다." });
    return;
  }

  client.grants.set(branch.session.sessionid, {
    sessionid: branch.session.sessionid,
    userid: branch.session.userid,
    projectName: branch.session.projectname,
    createdat: new Date()
  });
  await sendJson(client, {
    type: NDX_SESSION_BRANCH_CREATED,
    sourceSessionid: branch.sourceSession.sessionid,
    inputDataId: branch.inputDataId,
    session: toSocketSession(branch.session),
    compact: toSocketSessionData(branch.compact)
  });
  await broadcastSessionListChanged(connectedClients, branch.session.userid, branch.session.projectname, logger);
  logger?.info("agent.socket.protocol.session_branch_create.complete", { clientid: client.clientid, sourceSessionid: branch.sourceSession.sessionid, sessionid: branch.session.sessionid });
}

async function broadcastSessionListChanged(
  connectedClients: Map<string, SessionClientState>,
  userid: string,
  projectname: string,
  logger?: NDXLogger
) {
  const targets = [...connectedClients.values()].filter((client) => client.userid === userid);
  await Promise.all(targets.map((target) => sendJson(target, { type: NDX_SESSION_LIST_CHANGED, userid, projectname })));
  logger?.debug("agent.socket.session_list.changed.broadcast", { userid, projectname, count: targets.length });
}

async function attachSessionGrant(
  client: SessionClientState,
  message: NDXSessionAttachMessage,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  logger?.info("agent.socket.protocol.session_attach.start", {
    clientid: client.clientid,
    userid: message.userid,
    projectName: message.projectName,
    sessionid: message.sessionid
  });
  const session = await getSession(database, message.sessionid);
  if (!session || session.userid !== message.userid || session.projectname !== message.projectName) {
    logger?.warn("agent.socket.protocol.session_attach.rejected", { clientid: client.clientid, sessionid: message.sessionid });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_ATTACH_UNAVAILABLE_ERROR, { language: client.language }) });
    return;
  }

  client.grants.set(session.sessionid, {
    sessionid: session.sessionid,
    userid: session.userid,
    projectName: session.projectname,
    createdat: new Date()
  });
  await sendJson(client, {
    type: NDX_SESSION_ATTACHED,
    createdat: new Date().toISOString(),
    sessionid: session.sessionid,
    userid: session.userid,
    projectName: session.projectname
  });
  await sendPendingClientRequestsForSession(client, session.sessionid);
  logger?.info("agent.socket.protocol.session_attach.complete", { clientid: client.clientid, sessionid: session.sessionid });
}

async function requireSessionGrant(
  client: SessionClientState,
  sessionid: string,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  const grant = client.grants.get(sessionid);
  if (!grant) {
    logger?.warn("agent.socket.protocol.session_grant.rejected", { clientid: client.clientid, sessionid });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_REQUIRED_ERROR, { language: client.language }) });
    return undefined;
  }
  return grant;
}

function messageType(message: unknown) {
  return message && typeof message === "object" && "type" in message ? String(message.type) : typeof message;
}

function socketSessionEventContents(contents: unknown): NDXSessionEventMessage["contents"] {
  if (typeof contents === "string") return contents;
  if (contents && typeof contents === "object" && !Array.isArray(contents)) {
    return contents as NDXSessionEventMessage["contents"];
  }
  return String(contents ?? "");
}

function defaultModelConfig(): NDXModelConfig {
  return { type: "openai", model: "gpt-5.4", url: "", token: "", contextsize: 200_000, modalities: ["text"] };
}

function toSocketSession(session: NDXSessionRow) {
  return {
    ...session,
    lastupdated: session.lastupdated.toISOString(),
    interruptrequestedat: session.interruptrequestedat?.toISOString() ?? null,
    interruptcompletedat: session.interruptcompletedat?.toISOString() ?? null
  };
}

function toSocketSessionData(row: NDXSessionDataRow) {
  return {
    dataid: String(row.dataid),
    sessionid: row.sessionid,
    type: row.type,
    contents: socketSessionEventContents(row.contents),
    createdat: row.createdat.toISOString()
  };
}

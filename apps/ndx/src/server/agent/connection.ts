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
  NDX_SESSION_SKILL_LIST_RESULT,
  NDX_SESSION_TURN_DETAIL_RESULT,
  NDX_SESSION_TURN_DELETED,
  NDX_TURN_EVENT,
  NDX_AGENT_RESOURCE,
  NDX_PROJECT_NEGOTIATION_REQUIRED,
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
  isNDXSessionRequestQueueAddMessage,
  isNDXSessionRequestQueueDeleteMessage,
  isNDXSessionRequestQueueUpdateMessage,
  isNDXSessionClientResponseMessage,
  isNDXSessionRenameMessage,
  isNDXSessionSkillListMessage,
  isNDXSessionTurnDetailMessage,
} from "ndx/common";
import type { NDXSessionAttachMessage, NDXSessionBranchCreateMessage, NDXSessionCreateInitialInput, NDXSessionCreateMessage, NDXSessionDeleteMessage, NDXSessionRenameMessage, NDXSessionSkillListMessage, NDXSessionTurnDeleteMessage } from "ndx/common/protocol";
import {
  appendSessionData,
  compactBranchSession,
  createSession,
  createBranchSessionFromTurn,
  deleteSession,
  deleteSessionTurn,
  errorContents,
  getSession,
  interruptContents,
  completeSessionInterrupt,
  requestSessionInterrupt,
  assertModelSupportsAttachments,
  userMessageContents,
  sessionDataText,
  sessionDataTitleText,
  updateSessionEndTurn,
  updateSessionTitle,
  writeSessionAttachments,
  type NDXModelConfig,
  type NDXSessionDataRow,
  type NDXSessionRow,
  type NDXBranchSessionStartResult
} from "ndx/agent/session";
import { loadSkills } from "ndx/agent/context";
import { estimateContextTokens } from "ndx/agent/contextusage";
import type { NDXDatabase } from "ndx/agent/init";
import {
  getRuntimeTurnPhase,
  requestRuntimeTurnInterrupt,
  runAgentTurnWithAfterResponseTriggers,
  type NDXAfterResponseTriggerLaunch
} from "ndx/agent/turnloop";
import type { NDXLogger } from "ndx/common";
import { readNDXSettingsDocument, resolveSettingsModelConfig } from "ndx/common/settings";
import { serverContainerUserHome, serverWorkspaceProjectPath, toServerProjectPath } from "ndx/common/server-path";
import type { RawData, WebSocket } from "ws";
import { buildSessionHistorySummary, buildSessionIterationDetail, buildSessionTurnDetail } from "./history.js";
import { acceptProjectNegotiation } from "./projectNegotiation.js";
import {
  broadcastSessionRequestQueueChanged,
  claimQueuedSessionRunGuard,
  deleteSessionRequest,
  enqueueSessionRequest,
  finishSessionClientResponse,
  hasQueuedSessionRequests,
  isQueuedSessionRequestRunning,
  releaseQueuedSessionGuardWhenLaunchFinishes,
  sendPendingClientRequestsForSession,
  sendSessionRequestQueueChanged,
  sessionTurnLoopEvents,
  startQueuedSessionRequests,
  updateSessionRequest
} from "./requestQueueSocket.js";
import { sendJson } from "./sendJson.js";
import {
  compactFallbackReason,
  sessionEventSocketMessage,
  sessionGrantOwnerTargets,
  toSocketSession
} from "./socketMessages.js";
import { SOCKET_HEARTBEAT_SLOW_PONG_MS, SOCKET_MESSAGE_SLOW_MS } from "./monitor.js";
import type { SessionClientState } from "./types.js";

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
    const roundTripMs = client.lastPingAt ? Date.now() - client.lastPingAt : undefined;
    client.missedPings = 0;
    client.pongSinceLastPing = true;
    if (roundTripMs && roundTripMs > SOCKET_HEARTBEAT_SLOW_PONG_MS) {
      logger?.warn("agent.socket.heartbeat.pong_slow", { clientid, roundTripMs, thresholdMs: SOCKET_HEARTBEAT_SLOW_PONG_MS });
    } else {
      logger?.debug("agent.socket.heartbeat.pong", { clientid, roundTripMs });
    }
  });

  socket.on("message", (data) => {
    const startedAt = Date.now();
    const text = data.toString("utf8");
    const logContext = socketMessageLogContext(text);
    client.inFlightMessages = (client.inFlightMessages ?? 0) + 1;
    logger?.debug("agent.socket.message.received", { clientid, bytes: text.length, inFlightMessages: client.inFlightMessages, ...logContext });
    void handleSessionMessage(client, data, connectedClients, database, logger, resource)
      .then(() => {
        const durationMs = Date.now() - startedAt;
        const payload = { clientid, bytes: text.length, durationMs, thresholdMs: SOCKET_MESSAGE_SLOW_MS, ...logContext };
        if (durationMs > SOCKET_MESSAGE_SLOW_MS) {
          logger?.warn("agent.socket.message.handle.slow", payload);
        } else {
          logger?.debug("agent.socket.message.handle.complete", payload);
        }
      }, (error) => {
        logger?.error("agent.socket.message.failed", { clientid, error, ...logContext, durationMs: Date.now() - startedAt });
      })
      .finally(() => {
        client.inFlightMessages = Math.max(0, (client.inFlightMessages ?? 1) - 1);
      });
  });

  socket.on("close", () => {
    connectedClients.delete(connectionKey);
    logger?.info("agent.socket.connection.close", { clientid, connectedCount: connectedClients.size });
  });

  socket.on("error", (error) => {
    logger?.error("agent.socket.connection.error", { clientid, error });
  });

  await sendJson(client, { type: NDX_PROJECT_NEGOTIATION_REQUIRED }, { logger, event: "project_negotiation" });
}

function socketMessageLogContext(text: string): { messageType?: string; sessionid?: string } {
  try {
    const message = JSON.parse(text) as { type?: unknown; sessionid?: unknown };
    return {
      messageType: typeof message.type === "string" ? message.type : undefined,
      sessionid: typeof message.sessionid === "string" ? message.sessionid : undefined
    };
  } catch {
    return {};
  }
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
    const grant = await requireSessionGrant(client, message.sessionid, database, logger, resource);
    if (!grant || !finishSessionClientResponse(grant.sessionid, message.requestId, message.response)) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_UNAVAILABLE_ERROR, { language }) });
      return;
    }
    return;
  }

  if (isNDXSessionRequestQueueAddMessage(message)) {
    const grant = await requireSessionGrant(client, message.sessionid, database, logger, resource);
    if (!grant) return;
    const session = await getSession(database, grant.sessionid);
    if (!session) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_UNAVAILABLE_ERROR, { language }) });
      return;
    }
    const turnModel = message.model ?? session.model;
    let attachments;
    try {
      assertModelSupportsAttachments(turnModel, message.attachments);
      attachments = await writeSessionAttachments(toServerProjectPath(session.path), session.sessionid, message.attachments);
    } catch (error) {
      logger?.warn("agent.socket.protocol.session_request_queue.attachment_rejected", { clientid: client.clientid, sessionid: session.sessionid, error });
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_UNSUPPORTED_SESSION_MESSAGE_ERROR, { language }) });
      return;
    }
    enqueueSessionRequest({
      sessionid: session.sessionid,
      text: message.text.trim(),
      attachments,
      model: turnModel,
      modelSource: message.model ? "client-selected" : "session-default"
    });
    await broadcastSessionRequestQueueChanged(connectedClients, session.sessionid, logger);
    if (!session.isrunning) {
      void startQueuedSessionRequests(connectedClients, database, session, language, resource, logger);
    }
    return;
  }

  if (isNDXSessionRequestQueueUpdateMessage(message)) {
    const grant = await requireSessionGrant(client, message.sessionid, database, logger, resource);
    if (!grant) return;
    const session = await getSession(database, grant.sessionid);
    if (!session) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_UNAVAILABLE_ERROR, { language }) });
      return;
    }
    const turnModel = message.model ?? session.model;
    let attachments;
    try {
      assertModelSupportsAttachments(turnModel, message.attachments);
      attachments = await writeSessionAttachments(toServerProjectPath(session.path), session.sessionid, message.attachments);
    } catch (error) {
      logger?.warn("agent.socket.protocol.session_request_queue.update_attachment_rejected", { clientid: client.clientid, sessionid: session.sessionid, error });
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_UNSUPPORTED_SESSION_MESSAGE_ERROR, { language }) });
      return;
    }
    updateSessionRequest({
      sessionid: grant.sessionid,
      itemid: message.itemid,
      text: message.text,
      model: turnModel,
      modelSource: message.model ? "client-selected" : "session-default",
      keepAttachmentIds: message.keepAttachmentIds,
      attachments
    });
    await broadcastSessionRequestQueueChanged(connectedClients, grant.sessionid, logger);
    return;
  }

  if (isNDXSessionRequestQueueDeleteMessage(message)) {
    const grant = await requireSessionGrant(client, message.sessionid, database, logger, resource);
    if (!grant) return;
    deleteSessionRequest(grant.sessionid, message.itemid);
    await broadcastSessionRequestQueueChanged(connectedClients, grant.sessionid, logger);
    return;
  }

  if (isNDXSessionInputMessage(message)) {
    logger?.info("agent.socket.protocol.session_input.start", {
      clientid: client.clientid,
      sessionid: message.sessionid,
      textLength: message.text.length,
      attachmentCount: message.attachments?.length ?? 0
    });
    const grant = await requireSessionGrant(client, message.sessionid, database, logger, resource);
    if (!grant) {
      return;
    }
    const session = await getSession(database, grant.sessionid);
    if (!session) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_UNAVAILABLE_ERROR, { language }) });
      return;
    }
    if (session.isrunning || isQueuedSessionRequestRunning(session.sessionid)) {
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

    claimQueuedSessionRunGuard(session.sessionid);
    let launch: NDXAfterResponseTriggerLaunch | undefined;
    try {
      launch = await runAgentTurnWithAfterResponseTriggers(
        database,
        session,
        { text: message.text.trim(), attachments },
        message.model,
        sessionTurnLoopEvents(connectedClients, session, language, resource, logger)
      );
    } finally {
      releaseQueuedSessionGuardWhenLaunchFinishes(session.sessionid, launch, () => {
        if (hasQueuedSessionRequests(session.sessionid)) {
          void startQueuedSessionRequests(connectedClients, database, session, language, resource, logger);
        }
      });
    }
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
    const grant = await requireSessionGrant(client, message.sessionid, database, logger, resource);
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
    const grant = await requireSessionGrant(client, message.sessionid, database, logger, resource);
    if (!grant) return;
    await sendJson(client, {
      type: NDX_SESSION_TURN_DETAIL_RESULT,
      sessionid: grant.sessionid,
      turn: await buildSessionTurnDetail(database, grant.sessionid, message.inputDataId)
    });
    return;
  }

  if (isNDXSessionIterationDetailMessage(message)) {
    const grant = await requireSessionGrant(client, message.sessionid, database, logger, resource);
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
    const grant = await requireSessionGrant(client, message.sessionid, database, logger, resource);
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
      messageType: messageType(message)
    });
    await acceptProjectNegotiation(client, message, database, logger, resource);
    return;
  }

  if (isNDXSessionCreateMessage(message)) {
    logger?.info("agent.socket.protocol.session_create.start", {
      clientid: client.clientid,
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
      projectName: session.projectname,
      createdat: new Date()
    });
    await sendJson(client, {
      type: NDX_SESSION_CREATED,
      ...(initialInput ? { initialInputAccepted: true } : {}),
      ...toSocketSession(session)
    });
    await broadcastSessionListChanged(connectedClients, session.projectname, logger);
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
  const projectName = message.projectName ?? client.projectName;
  if (!projectName) {
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
    projectname: projectName,
    model: message.model ?? await defaultModelConfig()
  };
}

async function sendSkillListFromSocket(
  client: SessionClientState,
  message: NDXSessionSkillListMessage,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  let projectName = message.projectName ?? client.projectName;
  if (message.sessionid) {
    const grant = await requireSessionGrant(client, message.sessionid, database, logger, resource);
    if (!grant) {
      return;
    }
    projectName = grant.projectName;
  }
  if (!projectName) {
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SKILL_LIST_PROJECT_REQUIRED_ERROR, { language: client.language }) });
    return;
  }
  let projectHome: string;
  try {
    projectHome = serverWorkspaceProjectPath(projectName);
    const stat = await fs.stat(projectHome).catch(() => undefined);
    if (!stat?.isDirectory()) {
      throw new Error(`Project not found: ${projectName}`);
    }
  } catch {
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_PATH_OUTSIDE_WORKSPACE_ERROR, { language: client.language }) });
    return;
  }
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
    projectName: message.projectName,
    sessionid: message.sessionid,
    titleLength: message.title.trim().length
  });
  const session = await getSession(database, message.sessionid);
  if (!session || session.projectname !== message.projectName) {
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
    await broadcastSessionListChanged(connectedClients, renamed.projectname, logger);
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
    projectName: message.projectName,
    sessionid: message.sessionid
  });
  const session = await getSession(database, message.sessionid);
  if (!session || session.projectname !== message.projectName) {
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
    projectname: deleted.projectname
  });
  await broadcastSessionListChanged(connectedClients, deleted.projectname, logger);
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
  const grant = await requireSessionGrant(client, message.sessionid, database, logger, resource);
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
  await broadcastSessionListChanged(connectedClients, deleted.session.projectname, logger);
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
  const grant = await requireSessionGrant(client, message.sessionid, database, logger, resource);
  if (!grant) return;

  let branch;
  try {
    branch = await createBranchSessionFromTurn(database, grant.sessionid, message.inputDataId);
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
    projectName: branch.session.projectname,
    createdat: new Date()
  });
  await sendJson(client, {
    type: NDX_SESSION_BRANCH_CREATED,
    sourceSessionid: branch.sourceSession.sessionid,
    inputDataId: branch.inputDataId,
    session: toSocketSession(branch.session),
    compactStatus: "running"
  });
  await sendBranchCompactEvent(connectedClients, branch, "started", logger);
  await broadcastSessionListChanged(connectedClients, branch.session.projectname, logger);
  void finishBranchSessionCompact(client, branch, connectedClients, database, logger);
  logger?.info("agent.socket.protocol.session_branch_create.accepted", { clientid: client.clientid, sourceSessionid: branch.sourceSession.sessionid, sessionid: branch.session.sessionid });
}

async function finishBranchSessionCompact(
  client: SessionClientState,
  branch: NDXBranchSessionStartResult,
  connectedClients: Map<string, SessionClientState>,
  database: NDXDatabase,
  logger?: NDXLogger
) {
  try {
    const completed = await compactBranchSession(database, branch);
    await sendBranchCompactEvent(connectedClients, branch, "completed", logger, completed.compact);
    await broadcastSessionListChanged(connectedClients, branch.session.projectname, logger);
    logger?.info("agent.socket.protocol.session_branch_create.complete", { clientid: client.clientid, sourceSessionid: branch.sourceSession.sessionid, sessionid: branch.session.sessionid });
  } catch (error) {
    logger?.warn("agent.socket.protocol.session_branch_compact.failed", { clientid: client.clientid, sourceSessionid: branch.sourceSession.sessionid, sessionid: branch.session.sessionid, error });
    const message = error instanceof Error && error.message.trim()
      ? error.message
      : "이전 히스토리 compact 생성에 실패했습니다.";
    await sendBranchCompactFailedEvent(connectedClients, branch, message, database, logger);
    await broadcastSessionListChanged(connectedClients, branch.session.projectname, logger);
  }
}

async function sendBranchCompactFailedEvent(
  connectedClients: Map<string, SessionClientState>,
  branch: NDXBranchSessionStartResult,
  message: string,
  database: NDXDatabase,
  logger?: NDXLogger
) {
  const session = await updateSessionEndTurn(database, branch.session.sessionid).catch(() => branch.session);
  const contents = errorContents(message);
  const row = await appendSessionData(database, branch.session.sessionid, "assistant", contents);
  const report = branch.report;
  const contextUsage = {
    tokens: report.tokens,
    messageTokens: report.tokens,
    toolDefinitionTokens: 0,
    percent: report.percent,
    contextsize: report.contextsize
  };
  const event = sessionEventSocketMessage(session, NDX_TURN_EVENT.Failed, String(row.dataid), contents, row.createdat.toISOString(), contextUsage, { isrunning: false });
  const targets = sessionGrantOwnerTargets(connectedClients, branch.session.sessionid);
  await Promise.all(targets.map((target) => sendJson(target.client, event)));
  logger?.debug("agent.socket.session_branch.compact_failed_event.sent", { sessionid: branch.session.sessionid, count: targets.length });
}

async function sendBranchCompactEvent(
  connectedClients: Map<string, SessionClientState>,
  branch: NDXBranchSessionStartResult,
  phase: "started" | "completed",
  logger?: NDXLogger,
  compact?: NDXSessionDataRow
) {
  const report = branch.report;
  const contextUsage = {
    tokens: report.tokens,
    messageTokens: report.tokens,
    toolDefinitionTokens: 0,
    percent: report.percent,
    contextsize: report.contextsize
  };
  const targets = sessionGrantOwnerTargets(connectedClients, branch.session.sessionid);
  const message = phase === "started"
    ? sessionEventSocketMessage(branch.session, NDX_TURN_EVENT.CompactStarted, `branch-compact-start:${branch.session.sessionid}:${branch.inputDataId}`, { kind: "compact_started", ...report }, new Date().toISOString(), contextUsage, { isrunning: true })
    : sessionEventSocketMessage(branch.session, NDX_TURN_EVENT.CompactCompleted, String(compact?.dataid ?? `branch-compact-complete:${branch.session.sessionid}:${branch.inputDataId}`), {
      kind: "compact_completed",
      ...report,
      compactDataId: String(compact?.dataid ?? ""),
      sourceRowCount: branch.sourceRows.length,
      summaryTokens: compact ? estimateContextTokens(sessionDataText(compact) ?? JSON.stringify(compact.contents ?? "")) : 0,
      ...compactFallbackReason(compact)
    }, compact?.createdat.toISOString() ?? new Date().toISOString(), contextUsage, { isrunning: false });
  await Promise.all(targets.map((target) => sendJson(target.client, message)));
  logger?.debug("agent.socket.session_branch.compact_event.sent", { sessionid: branch.session.sessionid, event: message.event, count: targets.length });
}

async function broadcastSessionListChanged(
  connectedClients: Map<string, SessionClientState>,
  projectname: string,
  logger?: NDXLogger
) {
  const targets = [...connectedClients.values()].filter((client) => client.projectName === projectname);
  await Promise.all(targets.map((target) => sendJson(target, { type: NDX_SESSION_LIST_CHANGED, projectname })));
  logger?.debug("agent.socket.session_list.changed.broadcast", { projectname, count: targets.length });
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
    projectName: message.projectName,
    sessionid: message.sessionid
  });
  const session = await getSession(database, message.sessionid);
  if (!session || session.projectname !== message.projectName) {
    logger?.warn("agent.socket.protocol.session_attach.rejected", { clientid: client.clientid, sessionid: message.sessionid });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_ATTACH_UNAVAILABLE_ERROR, { language: client.language }) });
    return;
  }
  const parentSessionid = session.parentsessionid ?? session.sessionid;
  if (parentSessionid !== session.sessionid && !client.grants.has(parentSessionid) && !await hasGrantedAncestor(client, database, session)) {
    logger?.warn("agent.socket.protocol.session_attach.rejected_missing_parent_grant", { clientid: client.clientid, sessionid: message.sessionid, parentsessionid: parentSessionid });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_REQUIRED_ERROR, { language: client.language }) });
    return;
  }

  client.grants.set(session.sessionid, {
    sessionid: session.sessionid,
    projectName: session.projectname,
    createdat: new Date()
  });
  await sendJson(client, {
    type: NDX_SESSION_ATTACHED,
    createdat: new Date().toISOString(),
    sessionid: session.sessionid,
    projectName: session.projectname
  });
  await sendPendingClientRequestsForSession(client, session.sessionid);
  await sendSessionRequestQueueChanged(client, session.sessionid);
  logger?.info("agent.socket.protocol.session_attach.complete", { clientid: client.clientid, sessionid: session.sessionid });
}

async function requireSessionGrant(
  client: SessionClientState,
  sessionid: string,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  const grant = client.grants.get(sessionid);
  if (grant) {
    return grant;
  }
  const session = await getSession(database, sessionid);
  if (session && await hasGrantedAncestor(client, database, session)) {
    return {
      sessionid: session.sessionid,
      projectName: session.projectname,
      createdat: new Date()
    };
  }
  if (!grant) {
    logger?.warn("agent.socket.protocol.session_grant.rejected", { clientid: client.clientid, sessionid });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_REQUIRED_ERROR, { language: client.language }) });
    return undefined;
  }
}

async function hasGrantedAncestor(client: SessionClientState, database: NDXDatabase, session: NDXSessionRow): Promise<boolean> {
  let current: NDXSessionRow | undefined = session;
  const visited = new Set<string>();
  while (current?.parentsessionid && current.parentsessionid !== current.sessionid && !visited.has(current.sessionid)) {
    visited.add(current.sessionid);
    if (client.grants.has(current.parentsessionid)) return true;
    current = await getSession(database, current.parentsessionid);
  }
  return false;
}

function messageType(message: unknown) {
  return message && typeof message === "object" && "type" in message ? String(message.type) : typeof message;
}

async function defaultModelConfig(): Promise<NDXModelConfig> {
  const settings = await readNDXSettingsDocument(serverContainerUserHome()).catch(() => undefined);
  const requested = typeof settings?.model === "string" ? settings.model : "";
  const resolved = settings && requested ? resolveSettingsModelConfig(settings, requested, 200_000) : undefined;
  if (resolved) {
    return resolved.model;
  }
  return { type: "openai", model: "gpt-5.4", url: "", token: "", contextsize: 200_000, modalities: ["text"] };
}

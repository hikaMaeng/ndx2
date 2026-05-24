import {
  NDX_PROTOCOL_ERROR,
  NDX_SESSION_ATTACHED,
  NDX_SESSION_CREATED,
  NDX_SESSION_DELETED,
  NDX_SESSION_EVENT,
  NDX_SESSION_LIST_CHANGED,
  NDX_SESSION_RENAMED,
  NDX_TURN_EVENT,
  NDX_AGENT_RESOURCE,
  createNDXAgentResourceResolver,
  normalizeNDXAgentLanguage,
  type NDXAgentResourceResolver,
  isNDXSessionAttachMessage,
  isNDXSessionCreateMessage,
  isNDXSessionDeleteMessage,
  isNDXSessionHistorySummaryMessage,
  isNDXSessionInputMessage,
  isNDXSessionIterationDetailMessage,
  isNDXSessionInterruptMessage,
  isNDXSessionRenameMessage,
  isNDXSessionSkillListMessage,
  isNDXSessionTurnDetailMessage
} from "ndx/agent/common";
import type { NDXSessionAttachMessage, NDXSessionCreateMessage, NDXSessionDeleteMessage, NDXSessionRenameMessage, NDXSessionSkillListMessage } from "ndx/agent/common/protocol";
import {
  appendSessionData,
  createSession,
  createSessionToken,
  deleteSession,
  ensureProject,
  getSession,
  getProjectById,
  getSessionTokenGrant,
  getRuntimeTurnPhase,
  interruptContents,
  loadSkills,
  completeSessionInterrupt,
  requestRuntimeTurnInterrupt,
  requestSessionInterrupt,
  assertModelSupportsAttachments,
  updateSessionTitle,
  writeSessionAttachments,
  type NDXDatabase,
  type NDXModelConfig,
  type NDXSessionRow,
  runAgentTurn
} from "ndx/agent/server";
import type { NDXLogger } from "ndx/common";
import { serverContainerUserHome, toServerProjectPath, toServerWorkspaceDescendantPath } from "ndx/server/common";
import type { RawData, WebSocket } from "ws";
import { acceptAccountSelection, requireAccountSelection } from "./accountSelection.js";
import { buildSessionHistorySummary, buildSessionIterationDetail, buildSessionTurnDetail } from "./history.js";
import { acceptProjectNegotiation } from "./projectNegotiation.js";
import { sendJson } from "./sendJson.js";
import type { SessionClientState } from "./types.js";

export async function handleSessionConnection(
  socket: WebSocket,
  clientid: string,
  connectedClients: Map<string, SessionClientState>,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  const client: SessionClientState = {
    clientid,
    socket,
    grants: new Map(),
    missedPings: 0,
    pongSinceLastPing: true
  };
  connectedClients.set(clientid, client);
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
    connectedClients.delete(clientid);
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
    await attachSessionToken(client, message, database, logger, resource);
    return;
  }

  if (isNDXSessionSkillListMessage(message) && message.connectionToken) {
    await sendSkillListFromSocket(client, message, database, logger, resource);
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
      connectionToken: message.connectionToken,
      textLength: message.text.length,
      attachmentCount: message.attachments?.length ?? 0
    });
    const grant = await requireConnectionTokenGrant(client, message.connectionToken, database, logger, resource);
    if (!grant) {
      return;
    }
    const session = await getSession(database, grant.sessionid);
    if (!session) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_CONNECTION_TOKEN_UNAVAILABLE_ERROR, { language }) });
      return;
    }
    if (session.isrunning) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_ALREADY_RUNNING_ERROR, { language }) });
      return;
    }

    const turnModel = message.model ?? session.model;
    assertModelSupportsAttachments(turnModel, message.attachments);
    const attachments = await writeSessionAttachments(toServerProjectPath(session.path), session.sessionid, message.attachments);

    await runAgentTurn(database, session, { text: message.text.trim(), attachments }, message.model, {
      language,
      resource,
      async onEvent(event) {
        if (event.type === NDX_TURN_EVENT.InputRecorded) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: String(event.input.dataid),
            contents: event.input.contents,
            createdat: event.input.createdat.toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.AssistantDelta) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: `stream:${session.sessionid}:${event.iteration}`,
            contents: { kind: "assistant_delta", iteration: event.iteration, delta: event.delta, content: event.content },
            createdat: new Date().toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.AssistantReasoning) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: `reasoning:${session.sessionid}:${event.iteration}`,
            contents: { kind: "assistant_reasoning", iteration: event.iteration, summary: event.summary },
            createdat: new Date().toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.ModelRequest) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: `model:${session.sessionid}:${event.iteration}`,
            contents: { kind: "model_request", iteration: event.iteration, messageCount: event.messages.length },
            createdat: new Date().toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.ToolCallRecorded) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: String(event.data.dataid),
            contents: event.data.contents,
            createdat: event.data.createdat.toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.ToolBatchStarted) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: `tool-batch:${session.sessionid}:${event.iteration}`,
            contents: { kind: "tool_batch", iteration: event.iteration, toolCalls: event.toolCalls },
            createdat: new Date().toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.ToolProgress && event.status === "started") {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: `tool-start:${session.sessionid}:${event.iteration}:${event.callId ?? event.tool}`,
            contents: { kind: "tool_started", iteration: event.iteration, tool: event.tool, callId: event.callId, args: event.args, startedAt: event.startedAt, status: event.status },
            createdat: new Date().toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.ToolProgress && event.status === "progress") {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: `tool-progress:${session.sessionid}:${event.iteration}:${event.callId ?? event.tool}:${Date.now()}`,
            contents: { kind: "tool_progress", iteration: event.iteration, tool: event.tool, callId: event.callId, event: event.event, receivedAt: event.receivedAt, status: event.status },
            createdat: new Date().toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.CotWork) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: `cot-work:${session.sessionid}:${event.iteration}:${event.callId ?? event.tool}:${Date.now()}`,
            contents: event.contents,
            createdat: new Date().toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.ToolProgress && (event.status === "cancelled" || event.status === "timeout")) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: `tool-interrupt:${session.sessionid}:${event.iteration}:${event.callId ?? event.tool}:${Date.now()}`,
            contents: {
              kind: "tool_interrupt",
              iteration: event.iteration,
              tool: event.tool,
              callId: event.callId,
              phase: event.phase,
              status: event.status,
              signal: event.signal,
              receivedAt: event.receivedAt
            },
            createdat: new Date().toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.ToolProgress && event.status === "finished") {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: `tool-finish:${session.sessionid}:${event.iteration}:${event.result.callId ?? event.result.tool}`,
            contents: { kind: "tool_finished", iteration: event.iteration, result: event.result, status: event.status },
            createdat: new Date().toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.ToolResultRecorded) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: String(event.data.dataid),
            contents: event.data.contents,
            createdat: event.data.createdat.toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.ModelResume) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: `model-resume:${session.sessionid}:${event.iteration}`,
            contents: { kind: "model_request_resuming", iteration: event.iteration, results: event.results.map((result) => ({ tool: result.tool, callId: result.callId, status: result.status, success: result.success })) },
            createdat: new Date().toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.Interrupted) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: `turn-interrupted:${session.sessionid}:${Date.now()}`,
            contents: { kind: "turn_interrupted", phase: event.phase },
            createdat: new Date().toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.InterruptCompleted) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: `interrupt-completed:${session.sessionid}:${Date.now()}`,
            contents: { kind: "interrupt_completed", phase: event.phase, session: toSocketSession(event.session) },
            createdat: new Date().toISOString(),
            contextUsage: event.contextUsage
          });
        }
        if (event.type === NDX_TURN_EVENT.AssistantRecorded) {
          await sendJson(client, {
            type: NDX_SESSION_EVENT,
            sessionid: session.sessionid,
            event: event.type,
            dataid: String(event.assistant.dataid),
            contents: event.assistant.contents,
            createdat: event.assistant.createdat.toISOString(),
            contextUsage: event.contextUsage
          });
        }
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
    const grant = await requireConnectionTokenGrant(client, message.connectionToken, database, logger, resource);
    if (!grant) return;
    const history = await buildSessionHistorySummary(database, grant.sessionid);
    await sendJson(client, {
      type: "session.history.summary.result",
      sessionid: grant.sessionid,
      ...history
    });
    return;
  }

  if (isNDXSessionTurnDetailMessage(message)) {
    const grant = await requireConnectionTokenGrant(client, message.connectionToken, database, logger, resource);
    if (!grant) return;
    await sendJson(client, {
      type: "session.turn.detail.result",
      sessionid: grant.sessionid,
      turn: await buildSessionTurnDetail(database, grant.sessionid, message.inputDataId)
    });
    return;
  }

  if (isNDXSessionIterationDetailMessage(message)) {
    const grant = await requireConnectionTokenGrant(client, message.connectionToken, database, logger, resource);
    if (!grant) return;
    await sendJson(client, {
      type: "session.iteration.detail.result",
      sessionid: grant.sessionid,
      inputDataId: message.inputDataId,
      iteration: message.iteration,
      events: await buildSessionIterationDetail(database, grant.sessionid, message.inputDataId, message.iteration)
    });
    return;
  }

  if (isNDXSessionInterruptMessage(message)) {
    logger?.info("agent.socket.protocol.session_interrupt.start", { clientid: client.clientid, connectionToken: message.connectionToken });
    const grant = await requireConnectionTokenGrant(client, message.connectionToken, database, logger, resource);
    if (!grant) {
      return;
    }
    const session = await getSession(database, grant.sessionid);
    if (!session) {
      await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_CONNECTION_TOKEN_UNAVAILABLE_ERROR, { language }) });
      return;
    }

    const data = await appendSessionData(database, session.sessionid, "interrupt", interruptContents(new Date().toISOString()));
    const runtimePhase = getRuntimeTurnPhase(session.sessionid);
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

  if (isNDXSessionRenameMessage(message)) {
    await renameSessionFromSocket(client, message, connectedClients, database, logger, resource);
    return;
  }

  if (!client.projectId || !client.projectPath) {
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
      projectId: message.projectId ?? client.projectId,
      model: message.model?.model
    });
    const input = await resolveCreateSessionInput(client, message, database, logger, resource);
    if (!input) {
      return;
    }
    const session = await createSession(database, input);
    const token = await createSessionToken(database, session.sessionid);
    client.grants.set(token.token, {
      sessionid: session.sessionid,
      userid: session.userid,
      projectId: session.projectid,
      projectPath: session.path,
      createdat: token.createdat
    });
    await sendJson(client, {
      type: NDX_SESSION_CREATED,
      connectionToken: token.token,
      ...toSocketSession(session)
    });
    await broadcastSessionListChanged(connectedClients, session.userid, session.projectid, logger);
    logger?.info("agent.socket.protocol.session_create.complete", { clientid: client.clientid, sessionid: session.sessionid });
    return;
  }

  logger?.warn("agent.socket.protocol.unsupported_message", { clientid: client.clientid, messageType: messageType(message) });
  await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_UNSUPPORTED_SESSION_MESSAGE_ERROR, { language }) });
}

async function resolveCreateSessionInput(
  client: SessionClientState,
  message: NDXSessionCreateMessage,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  const userid = message.userid ?? client.userid;
  const projectId = message.projectId ?? client.projectId;
  const rawProjectPath = message.projectPath ?? client.projectPath;
  if (!userid || !projectId || !rawProjectPath) {
    logger?.warn("agent.socket.protocol.session_create.rejected", { clientid: client.clientid, reason: "missing_project" });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_CREATE_TARGET_REQUIRED_ERROR, { language: client.language }) });
    return undefined;
  }

  let projectPath: string;
  try {
    projectPath = toServerWorkspaceDescendantPath(rawProjectPath);
  } catch (error) {
    logger?.warn("agent.socket.protocol.session_create.rejected", { clientid: client.clientid, reason: "workspace_path", error });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_PATH_OUTSIDE_WORKSPACE_ERROR, { language: client.language }) });
    return undefined;
  }

  const identity = await ensureProject(database, { path: projectPath, target: "local" });
  if (identity.projectid !== projectId) {
    logger?.warn("agent.socket.protocol.session_create.rejected", { clientid: client.clientid, reason: "project_identity", projectId, actualProjectId: identity.projectid });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_CREATE_PROJECT_MISMATCH_ERROR, { language: client.language }) });
    return undefined;
  }

  return {
    userid,
    path: identity.path,
    projectid: identity.projectid,
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
  let projectPath = client.projectPath;
  if (message.connectionToken) {
    const grant = await requireConnectionTokenGrant(client, message.connectionToken, database, logger, resource);
    if (!grant) {
      return;
    }
    projectPath = grant.projectPath;
  }
  if (!projectPath) {
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SKILL_LIST_PROJECT_REQUIRED_ERROR, { language: client.language }) });
    return;
  }
  const projectHome = toServerProjectPath(projectPath);
  const skills = await loadSkills({ userHome: serverContainerUserHome(), projectHome, cwd: projectHome });
  await sendJson(client, {
    type: "session.skill.list.result",
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
    projectId: message.projectId,
    sessionid: message.sessionid,
    titleLength: message.title.trim().length
  });
  const session = await getSession(database, message.sessionid);
  let requestedProjectPath: string;
  try {
    requestedProjectPath = toServerWorkspaceDescendantPath(message.projectPath);
  } catch (error) {
    logger?.warn("agent.socket.protocol.session_rename.rejected", { clientid: client.clientid, sessionid: message.sessionid, reason: "workspace_path", error });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_PATH_OUTSIDE_WORKSPACE_ERROR, { language: client.language }) });
    return;
  }
  if (!session || session.userid !== message.userid || session.projectid !== message.projectId || session.path !== requestedProjectPath) {
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
    await broadcastSessionListChanged(connectedClients, renamed.userid, renamed.projectid, logger);
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
    projectId: message.projectId,
    sessionid: message.sessionid
  });
  const session = await getSession(database, message.sessionid);
  let requestedProjectPath: string;
  try {
    requestedProjectPath = toServerWorkspaceDescendantPath(message.projectPath);
  } catch (error) {
    logger?.warn("agent.socket.protocol.session_delete.rejected", { clientid: client.clientid, sessionid: message.sessionid, reason: "workspace_path", error });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_PATH_OUTSIDE_WORKSPACE_ERROR, { language: client.language }) });
    return;
  }
  if (!session || session.userid !== message.userid || session.projectid !== message.projectId || session.path !== requestedProjectPath) {
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
    for (const [token, grant] of target.grants) {
      if (grant.sessionid === message.sessionid) {
        target.grants.delete(token);
      }
    }
  }
  await sendJson(client, {
    type: NDX_SESSION_DELETED,
    sessionid: deleted.sessionid,
    userid: deleted.userid,
    projectid: deleted.projectid
  });
  await broadcastSessionListChanged(connectedClients, deleted.userid, deleted.projectid, logger);
  logger?.info("agent.socket.protocol.session_delete.complete", { clientid: client.clientid, sessionid: deleted.sessionid });
}

async function broadcastSessionListChanged(
  connectedClients: Map<string, SessionClientState>,
  userid: string,
  projectid: string,
  logger?: NDXLogger
) {
  const targets = [...connectedClients.values()].filter((client) => client.userid === userid);
  await Promise.all(targets.map((target) => sendJson(target, { type: NDX_SESSION_LIST_CHANGED, userid, projectid })));
  logger?.debug("agent.socket.session_list.changed.broadcast", { userid, projectid, count: targets.length });
}

async function attachSessionToken(
  client: SessionClientState,
  message: NDXSessionAttachMessage,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  logger?.info("agent.socket.protocol.session_attach.start", {
    clientid: client.clientid,
    userid: message.userid,
    projectId: message.projectId,
    sessionid: message.sessionid
  });
  const session = await getSession(database, message.sessionid);
  let requestedProjectPath: string;
  try {
    requestedProjectPath = toServerWorkspaceDescendantPath(message.projectPath);
  } catch (error) {
    logger?.warn("agent.socket.protocol.session_attach.rejected", { clientid: client.clientid, sessionid: message.sessionid, reason: "workspace_path", error });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_PATH_OUTSIDE_WORKSPACE_ERROR, { language: client.language }) });
    return;
  }
  if (!session || session.userid !== message.userid || session.projectid !== message.projectId || session.path !== requestedProjectPath) {
    logger?.warn("agent.socket.protocol.session_attach.rejected", { clientid: client.clientid, sessionid: message.sessionid });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_ATTACH_UNAVAILABLE_ERROR, { language: client.language }) });
    return;
  }
  const project = await getProjectById(database, session.projectid);
  if (!project || project.target !== "local" || project.path !== session.path) {
    logger?.warn("agent.socket.protocol.session_attach.rejected", { clientid: client.clientid, sessionid: message.sessionid, reason: "project_identity" });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_SESSION_ATTACH_PROJECT_MISMATCH_ERROR, { language: client.language }) });
    return;
  }

  const token = await createSessionToken(database, session.sessionid);
  client.grants.set(token.token, {
    sessionid: session.sessionid,
    userid: session.userid,
    projectId: session.projectid,
    projectPath: session.path,
    createdat: token.createdat
  });
  await sendJson(client, {
    type: NDX_SESSION_ATTACHED,
    connectionToken: token.token,
    createdat: token.createdat.toISOString(),
    sessionid: session.sessionid,
    userid: session.userid,
    projectId: session.projectid,
    projectPath: session.path
  });
  logger?.info("agent.socket.protocol.session_attach.complete", { clientid: client.clientid, sessionid: session.sessionid, token: token.token });
}

async function requireConnectionTokenGrant(
  client: SessionClientState,
  connectionToken: string,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  const socketGrant = client.grants.get(connectionToken);
  const databaseGrant = await getSessionTokenGrant(database, connectionToken);
  if (!databaseGrant) {
    client.grants.delete(connectionToken);
    logger?.warn("agent.socket.protocol.connection_token.rejected", { clientid: client.clientid, reason: "missing_or_expired" });
    await sendJson(client, { type: NDX_PROTOCOL_ERROR, error: resource(NDX_AGENT_RESOURCE.PROTOCOL_CONNECTION_TOKEN_EXPIRED_ERROR, { language: client.language }) });
    return undefined;
  }

  const grant = {
    ...(socketGrant ?? {
      createdat: databaseGrant.createdat,
      sessionid: databaseGrant.sessionid,
      userid: databaseGrant.userid,
      projectId: databaseGrant.projectid,
      projectPath: databaseGrant.path
    }),
    sessionid: databaseGrant.sessionid,
    userid: databaseGrant.userid,
    projectId: databaseGrant.projectid,
    projectPath: databaseGrant.path
  };

  client.grants.set(connectionToken, grant);
  client.userid = databaseGrant.userid;
  if (/^(?:[a-z]:[\\/]|\/)/iu.test(databaseGrant.path) || databaseGrant.path.startsWith("\\\\")) {
    client.projectId = databaseGrant.projectid;
    client.projectPath = databaseGrant.path;
  }

  return grant;
}

function messageType(message: unknown) {
  return message && typeof message === "object" && "type" in message ? String(message.type) : typeof message;
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

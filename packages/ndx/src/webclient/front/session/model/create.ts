import type { NDXSessionCreatedMessage } from "ndx/common/protocol";
import type { NDXAgentWebSession } from "ndx/webclient/common";
import { createSessionCapabilitiesModel } from "./capabilities.js";
import { createSessionComposerModel } from "./composer.js";
import { createSessionConnectionModel } from "./connection.js";
import { createSessionHistoryModel } from "./history.js";
import { createDraftSessionIdentity, createSessionIdentityFromCreated, createSessionIdentityFromRow } from "./identity.js";
import { createSessionRuntimeModel } from "./runtime.js";
import { createSessionSidebarModel } from "./sidebar.js";
import type { SessionInstanceModel } from "./types.js";
import { createSessionViewportModel } from "./viewport.js";

export function createDraftSessionModel(projectName: string): SessionInstanceModel {
  const identity = createDraftSessionIdentity(projectName);
  return {
    key: identity.key,
    identity,
    connection: createSessionConnectionModel(),
    composer: createSessionComposerModel(),
    capabilities: createSessionCapabilitiesModel(),
    history: createSessionHistoryModel(),
    runtime: createSessionRuntimeModel(),
    sidebar: createSessionSidebarModel(),
    viewport: createSessionViewportModel()
  };
}

export function createSessionModelFromRow(session: NDXAgentWebSession): SessionInstanceModel {
  const identity = createSessionIdentityFromRow(session);
  return {
    key: identity.key,
    identity,
    metadata: session,
    connection: createSessionConnectionModel(),
    composer: createSessionComposerModel(),
    capabilities: createSessionCapabilitiesModel(),
    history: createSessionHistoryModel(),
    runtime: { ...createSessionRuntimeModel(), agentRunning: Boolean(session.isrunning) },
    sidebar: createSessionSidebarModel(),
    viewport: createSessionViewportModel()
  };
}

export function promoteDraftSessionModel(model: SessionInstanceModel, message: NDXSessionCreatedMessage): SessionInstanceModel {
  const identity = createSessionIdentityFromCreated(message);
  return {
    ...model,
    key: identity.key,
    identity,
    metadata: {
      sessionid: message.sessionid,
      userid: message.userid,
      title: message.title,
      lastupdated: message.lastupdated,
      mode: message.mode,
      path: message.path,
      projectname: message.projectname,
      model: message.model,
      isrunning: message.isrunning
    },
    connection: {
      ...model.connection,
      attached: true,
      lastAttachedAt: message.lastupdated
    },
    runtime: {
      ...model.runtime,
      agentRunning: message.initialInputAccepted ? true : Boolean(message.isrunning)
    }
  };
}

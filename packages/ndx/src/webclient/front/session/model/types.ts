import type { NDXAgentWebSession } from "ndx/webclient/common";
import type { SessionCapabilitiesModel } from "./capabilities.js";
import type { SessionComposerModel } from "./composer.js";
import type { SessionConnectionModel } from "./connection.js";
import type { SessionHistoryModel } from "./history.js";
import type { SessionIdentityModel } from "./identity.js";
import type { SessionRuntimeModel } from "./runtime.js";
import type { SessionSidebarModel } from "./sidebar.js";
import type { SessionViewportModel } from "./viewport.js";

export type SessionInstanceModel = {
  key: string;
  identity: SessionIdentityModel;
  metadata?: NDXAgentWebSession;
  connection: SessionConnectionModel;
  composer: SessionComposerModel;
  capabilities: SessionCapabilitiesModel;
  history: SessionHistoryModel;
  runtime: SessionRuntimeModel;
  sidebar: SessionSidebarModel;
  viewport: SessionViewportModel;
};

export type SessionModelSnapshot = Record<string, SessionInstanceModel>;

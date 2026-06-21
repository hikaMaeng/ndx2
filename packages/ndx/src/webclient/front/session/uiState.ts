import type { NDXCotWorkContents, NDXSessionRequestQueueItem, NDXSessionSkillSummary, NDXSidebarItem } from "ndx/common/protocol";
import { DEFAULT_MODEL, toModelConfig } from "../model/config.js";
import type { EncodedAttachment } from "./attachment.js";
import type { ChatMessage, NDXAgentWebContextUsage } from "./chat.js";
import type { TurnFlowState } from "./turn/index.js";

export type PendingRequest = {
  text: string;
  model: ReturnType<typeof toModelConfig>;
  attachments?: EncodedAttachment[];
};

export type SessionAttachmentDraft = {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
};

export type SessionUiState = {
  chatInput: string;
  chatAttachments: SessionAttachmentDraft[];
  availableSkills: NDXSessionSkillSummary[];
  agentRunning: boolean;
  compactRunning: boolean;
  selectedModel: typeof DEFAULT_MODEL;
  chatMessages: ChatMessage[];
  turnFlows: TurnFlowState[];
  cotWork?: NDXCotWorkContents;
  requestQueue: NDXSessionRequestQueueItem[];
  requestQueueCollapsed: boolean;
  autoScrollEnabled: boolean;
  reportedContextUsage?: NDXAgentWebContextUsage;
  notice: string;
  sessionError: string;
  rightSidebarOpen: boolean;
  rightSidebarItems: NDXSidebarItem[];
  rightSidebarWidth: number;
  chatScrollTop: number;
  rightSidebarScrollTop: number;
  pendingInitialRequest?: PendingRequest;
  pendingAttachRequest?: PendingRequest & { sessionid: string };
};

export function createSessionUiState(): SessionUiState {
  return {
    chatInput: "",
    chatAttachments: [],
    availableSkills: [],
    agentRunning: false,
    compactRunning: false,
    selectedModel: DEFAULT_MODEL,
    chatMessages: [],
    turnFlows: [],
    requestQueue: [],
    requestQueueCollapsed: true,
    autoScrollEnabled: true,
    reportedContextUsage: undefined,
    notice: "",
    sessionError: "",
    rightSidebarOpen: false,
    rightSidebarItems: [],
    rightSidebarWidth: 288,
    chatScrollTop: 0,
    rightSidebarScrollTop: 0
  };
}

import { DEFAULT_MODEL, toModelConfig, type SelectedModelConfig } from "../../model/config.js";
import type { EncodedAttachment } from "../attachment.js";
import type { SessionAttachmentDraft } from "../uiState.js";

export type SessionComposerAttachmentModel = SessionAttachmentDraft;

export type SessionPendingRequestModel = {
  text: string;
  model: ReturnType<typeof toModelConfig>;
  attachments?: EncodedAttachment[];
};

export type SessionComposerModel = {
  input: string;
  attachments: SessionAttachmentDraft[];
  selectedModel: SelectedModelConfig;
  pendingInitialRequest?: SessionPendingRequestModel;
  pendingAttachRequest?: SessionPendingRequestModel & { sessionid: string };
};

export function createSessionComposerModel(): SessionComposerModel {
  return {
    input: "",
    attachments: [],
    selectedModel: DEFAULT_MODEL
  };
}

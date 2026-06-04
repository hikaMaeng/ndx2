import { DEFAULT_MODEL, toModelConfig, type SelectedModelConfig } from "../../model/config.js";
import type { EncodedAttachment } from "../attachment.js";

export type SessionComposerAttachmentModel = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
};

export type SessionPendingRequestModel = {
  text: string;
  model: ReturnType<typeof toModelConfig>;
  attachments?: EncodedAttachment[];
};

export type SessionComposerModel = {
  input: string;
  attachments: SessionComposerAttachmentModel[];
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

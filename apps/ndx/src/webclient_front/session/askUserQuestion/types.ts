import type { NDXSessionClientRequestMessage } from "ndx/common/protocol";

export type AskUserQuestionRequest = NDXSessionClientRequestMessage;

export type AskUserQuestionDraft = {
  attachments: Record<string, AskUserQuestionAttachmentDraft[]>;
  selected: Record<string, string>;
  text: Record<string, string>;
};

export type AskUserQuestionAttachmentDraft = {
  file: File;
  id: string;
  mimeType: string;
  name: string;
  previewUrl: string;
  size: number;
};

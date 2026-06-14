import type { NDXModelMessage, NDXSessionDataRow } from "../../../../session/types.js";
import type { NDXFinalRowProjectionPolicy } from "../rows/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export type NDXFinalMessageParts = {
  developer: NDXModelMessage;
  user: NDXModelMessage;
  history?: ResponseInputItem[];
  inlineAttachments?: ResponseInputItem[];
  historyRows?: NDXSessionDataRow[];
  inlineAttachmentDataIds?: Iterable<string>;
};

export type NDXFinalMessagePolicy = {
  name: string;
  apply: (context: NDXFinalMessagePipelineContext) => NDXFinalMessagePipelineContext;
};

export type NDXFinalMessageRowState = {
  row: NDXSessionDataRow;
  messages: ResponseInputItem[];
  suppressedBy?: string[];
};

export type NDXFinalMessagePipelineContext = {
  rows: NDXSessionDataRow[];
  inlineAttachmentDataIds: Set<string>;
  rowProjectionPolicies: NDXFinalRowProjectionPolicy[];
  rowStates: NDXFinalMessageRowState[];
  historyMessages: ResponseInputItem[];
  inlineAttachmentMessages: ResponseInputItem[];
  diagnostics: string[];
};

export type NDXFinalSessionMessages = {
  history: ResponseInputItem[];
  inlineAttachments: ResponseInputItem[];
  diagnostics: string[];
};

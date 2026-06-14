import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";
import { modelRequestMessageText } from "../../../contextusage/index.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export type NDXModelRequestPrefixDrift = {
  label: string;
  message: string;
  messageIndex?: number;
  previousMessageCount: number;
  nextMessageCount: number;
  stablePrefixLength: number;
  previousPreview?: string;
  nextPreview?: string;
};

export type NDXModelRequestPrefixSnapshot = string[];

const sessionModelRequestPrefixPreviews = new Map<string, NDXModelRequestPrefixSnapshot>();

export const prefixDriftAuditHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.model.request.prefix_drift_audit",
  source: "system",
  run(context): NDXHookEffect {
    const drift = inspectModelRequestPrefix(context.previousModelRequestStablePrefix, context.messages ?? []);
    return drift ? { prefixDrifts: [drift], diagnostics: [drift.message] } : { type: "noeffect" };
  }
};

export function snapshotModelRequestStablePrefix(messages: ResponseInputItem[]): NDXModelRequestPrefixSnapshot {
  return messages.slice(0, stablePrefixLength(messages)).map((message) => modelRequestMessageText(message));
}

export function readSessionModelRequestPrefixPreview(sessionid: string): NDXModelRequestPrefixSnapshot | undefined {
  const snapshot = sessionModelRequestPrefixPreviews.get(sessionid);
  return snapshot ? [...snapshot] : undefined;
}

export function rememberSessionModelRequestPrefixPreview(sessionid: string, messages: ResponseInputItem[]): NDXModelRequestPrefixSnapshot | undefined {
  const snapshot = snapshotModelRequestStablePrefix(messages);
  if (snapshot.length === 0) {
    sessionModelRequestPrefixPreviews.delete(sessionid);
    return undefined;
  }
  sessionModelRequestPrefixPreviews.set(sessionid, snapshot);
  return [...snapshot];
}

export function clearSessionModelRequestPrefixPreview(sessionid: string): void {
  sessionModelRequestPrefixPreviews.delete(sessionid);
}

export function inspectModelRequestPrefix(previousStablePrefix: NDXModelRequestPrefixSnapshot | undefined, next: ResponseInputItem[], label = "model request"): NDXModelRequestPrefixDrift | undefined {
  if (!previousStablePrefix || previousStablePrefix.length === 0) {
    return undefined;
  }
  const nextStablePrefix = snapshotModelRequestStablePrefix(next);
  if (nextStablePrefix.length < previousStablePrefix.length) {
    return {
      label,
      message: `${label} removed stable model-request prefix messages.`,
      previousMessageCount: previousStablePrefix.length,
      nextMessageCount: next.length,
      stablePrefixLength: previousStablePrefix.length
    };
  }
  for (let index = 0; index < previousStablePrefix.length; index += 1) {
    if (previousStablePrefix[index] !== nextStablePrefix[index]) {
      return {
        label,
        message: `${label} changed stable model-request prefix message ${index + 1}.`,
        messageIndex: index,
        previousMessageCount: previousStablePrefix.length,
        nextMessageCount: next.length,
        stablePrefixLength: previousStablePrefix.length,
        previousPreview: previewMessageKey(previousStablePrefix[index]),
        nextPreview: previewMessageKey(nextStablePrefix[index])
      };
    }
  }
  return undefined;
}

export function inspectContextPreparedMessagesPrefix(beforeStablePrefix: NDXModelRequestPrefixSnapshot, after: ResponseInputItem[]): NDXModelRequestPrefixDrift | undefined {
  return inspectModelRequestPrefix(beforeStablePrefix, after, "turn.context.prepared hook");
}

function stablePrefixLength(messages: ResponseInputItem[]): number {
  const attachmentIndex = messages.findIndex(hasOneRequestAttachmentPayload);
  return attachmentIndex < 0 ? messages.length : attachmentIndex;
}

function hasOneRequestAttachmentPayload(message: ResponseInputItem): boolean {
  if (!message || typeof message !== "object" || !("content" in message) || !Array.isArray(message.content)) {
    return false;
  }
  return message.content.some((part) => {
    if (!part || typeof part !== "object") {
      return false;
    }
    const type = (part as { type?: unknown }).type;
    return type === "input_image" || type === "input_file";
  });
}

function previewMessageKey(text: string | undefined): string {
  return text && text.length > 500 ? `${text.slice(0, 500)}...` : text ?? "null";
}

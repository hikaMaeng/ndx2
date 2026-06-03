import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";
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

export const prefixDriftAuditHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.model.request.prefix_drift_audit",
  source: "system",
  run(context): NDXHookEffect {
    const drift = inspectModelRequestPrefix(context.previousModelRequestMessages, context.messages ?? []);
    return drift ? { prefixDrifts: [drift], diagnostics: [drift.message] } : { type: "noeffect" };
  }
};

export function cloneModelRequestMessages(messages: ResponseInputItem[]): ResponseInputItem[] {
  return JSON.parse(JSON.stringify(messages)) as ResponseInputItem[];
}

export function inspectModelRequestPrefix(previous: ResponseInputItem[] | undefined, next: ResponseInputItem[], label = "model request"): NDXModelRequestPrefixDrift | undefined {
  if (!previous || previous.length === 0) {
    return undefined;
  }
  const prefixLength = stablePrefixLength(previous);
  if (next.length < prefixLength) {
    return {
      label,
      message: `${label} removed stable model-request prefix messages.`,
      previousMessageCount: previous.length,
      nextMessageCount: next.length,
      stablePrefixLength: prefixLength
    };
  }
  for (let index = 0; index < prefixLength; index += 1) {
    if (stableMessageKey(previous[index]) !== stableMessageKey(next[index])) {
      return {
        label,
        message: `${label} changed stable model-request prefix message ${index + 1}.`,
        messageIndex: index,
        previousMessageCount: previous.length,
        nextMessageCount: next.length,
        stablePrefixLength: prefixLength,
        previousPreview: previewMessage(previous[index]),
        nextPreview: previewMessage(next[index])
      };
    }
  }
  return undefined;
}

export function inspectContextPreparedMessagesPrefix(before: ResponseInputItem[], after: ResponseInputItem[]): NDXModelRequestPrefixDrift | undefined {
  return inspectModelRequestPrefix(before, after, "turn.context.prepared hook");
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

function stableMessageKey(message: ResponseInputItem | undefined): string {
  return JSON.stringify(message ?? null);
}

function previewMessage(message: ResponseInputItem | undefined): string {
  const text = stableMessageKey(message);
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

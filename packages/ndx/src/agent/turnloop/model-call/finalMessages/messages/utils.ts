import type { NDXSessionDataRow } from "../../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";
import type { NDXFinalMessagePipelineContext, NDXFinalMessageRowState } from "./types.js";

export function suppressRows(
  context: NDXFinalMessagePipelineContext,
  policyName: string,
  shouldSuppress: (state: NDXFinalMessageRowState) => boolean
): NDXFinalMessagePipelineContext {
  let suppressCount = 0;
  const rowStates = context.rowStates.map((state) => {
    if (!shouldSuppress(state)) {
      return state;
    }
    suppressCount += state.messages.length > 0 ? 1 : 0;
    return { ...state, messages: [], suppressedBy: [...(state.suppressedBy ?? []), policyName] };
  });
  return suppressCount > 0
    ? { ...context, rowStates, diagnostics: [...context.diagnostics, `${policyName}: ${suppressCount} row(s)`] }
    : context;
}

export function latestUserMessageDataId(rows: NDXSessionDataRow[]): string | undefined {
  for (const row of [...rows].reverse()) {
    const contents = row.contents;
    if (
      row.type === "user" &&
      contents &&
      typeof contents === "object" &&
      (contents as { kind?: unknown }).kind === "user_message"
    ) {
      return String(row.dataid);
    }
  }
  return undefined;
}

export function invalidToolArgumentCallIdsBeforeLatestUser(rows: NDXSessionDataRow[], latestUserDataId: string | undefined): Set<string> {
  const output = new Set<string>();
  if (!latestUserDataId) {
    return output;
  }
  for (const row of rows) {
    if (!isBeforeDataId(row.dataid, latestUserDataId)) {
      continue;
    }
    const contents = row.contents;
    if (!contents || typeof contents !== "object" || (contents as { kind?: unknown }).kind !== "tool_result") {
      continue;
    }
    const results = (contents as { results?: unknown }).results;
    if (!Array.isArray(results)) {
      continue;
    }
    for (const result of results) {
      if (!result || typeof result !== "object") {
        continue;
      }
      const record = result as { toolCallId?: unknown; success?: unknown; output?: unknown };
      if (record.success === false && typeof record.output === "string" && isInvalidToolArgumentOutput(record.output)) {
        output.add(typeof record.toolCallId === "string" && record.toolCallId.length > 0 ? record.toolCallId : "tool_call");
      }
    }
  }
  return output;
}

export function isBeforeDataId(dataid: string | number, boundary: string | undefined): boolean {
  if (!boundary) {
    return false;
  }
  const current = Number(dataid);
  const next = Number(boundary);
  return Number.isFinite(current) && Number.isFinite(next) && current < next;
}

export function messageCallId(message: ResponseInputItem): string {
  if ("call_id" in message && typeof message.call_id === "string" && message.call_id.length > 0) {
    return message.call_id;
  }
  return "";
}

export function isInvalidToolArgumentOutput(output: string): boolean {
  return /Bad control character in string literal in JSON|tool arguments must be valid JSON|Failed to parse tool call/i.test(output);
}

export function isRuntimeControlErrorMessage(message: string): boolean {
  return /^Turn interrupted during /i.test(message) ||
    /^model response reasoning /i.test(message) ||
    /^model stream ended without assistant content or tool calls\.?$/i.test(message) ||
    /^model response failed: Failed to parse tool call/i.test(message);
}

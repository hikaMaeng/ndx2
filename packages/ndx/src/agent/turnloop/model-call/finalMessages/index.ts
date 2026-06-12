import { sessionDataText } from "../../../session/content.js";
import { NDX_COT_WORK_CONTENT_KIND } from "../../../../common/protocol/index.js";
import type { NDXSessionAttachmentReference, NDXSessionDataContents } from "../../../../common/protocol/index.js";
import type { NDXModelMessage, NDXSessionDataRow } from "../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

const NDX_COMPACT_CONTENT_KIND = "compact";

export type NDXFinalMessageParts = {
  developer: NDXModelMessage;
  user: NDXModelMessage;
  history: ResponseInputItem[];
  inlineAttachments?: ResponseInputItem[];
  historyRows?: NDXSessionDataRow[];
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

export const finalMessagePolicies: NDXFinalMessagePolicy[] = [
  { name: "session history projection", apply: sessionHistoryProjectionPolicy },
  { name: "stale cot_work_reminder suppress", apply: staleCotWorkReminderSuppressPolicy },
  { name: "runtime-control error suppress", apply: runtimeControlErrorSuppressPolicy },
  { name: "invalid tool failure pair suppress", apply: invalidToolFailurePairSuppressPolicy },
  { name: "finalize session history", apply: finalizeSessionHistoryPolicy },
  { name: "inline attachment projection", apply: inlineAttachmentProjectionPolicy }
];

export function buildFinalSessionMessages(rows: NDXSessionDataRow[], inlineAttachmentDataIds: Iterable<string> = []): NDXFinalSessionMessages {
  const context = runFinalMessagePolicyPipeline({ rows, inlineAttachmentDataIds });
  return {
    history: context.historyMessages,
    inlineAttachments: context.inlineAttachmentMessages,
    diagnostics: context.diagnostics
  };
}

export function runFinalMessagePolicyPipeline(input: {
  rows: NDXSessionDataRow[];
  inlineAttachmentDataIds?: Iterable<string>;
  policies?: NDXFinalMessagePolicy[];
}): NDXFinalMessagePipelineContext {
  let context: NDXFinalMessagePipelineContext = {
    rows: input.rows,
    inlineAttachmentDataIds: new Set([...(input.inlineAttachmentDataIds ?? [])].map(String)),
    rowStates: [],
    historyMessages: [],
    inlineAttachmentMessages: [],
    diagnostics: []
  };
  for (const policy of input.policies ?? finalMessagePolicies) {
    context = policy.apply(context);
  }
  return context;
}

export function buildFinalModelMessagesFromParts(parts: NDXFinalMessageParts): ResponseInputItem[] {
  return [
    parts.developer,
    parts.user,
    ...parts.history,
    ...(parts.inlineAttachments ?? [])
  ].filter((message) => isNonEmptyResponseInputItem(message));
}

export function sessionDataRowsToModelMessages(rows: NDXSessionDataRow[]): ResponseInputItem[] {
  return buildFinalSessionMessages(rows).history;
}

export function sessionDataRowsToInlineAttachmentMessages(rows: NDXSessionDataRow[], inlineAttachmentDataIds: Iterable<string>): ResponseInputItem[] {
  return buildFinalSessionMessages(rows, inlineAttachmentDataIds).inlineAttachments;
}

function sessionHistoryProjectionPolicy(context: NDXFinalMessagePipelineContext): NDXFinalMessagePipelineContext {
  const toolCallIterations = new Set<number>();
  for (const row of context.rows) {
    if (row.contents && typeof row.contents === "object" && (row.contents as { kind?: unknown }).kind === "tool_call") {
      const iteration = (row.contents as { iteration?: unknown }).iteration;
      if (typeof iteration === "number") {
        toolCallIterations.add(iteration);
      }
    }
  }

  return {
    ...context,
    rowStates: context.rows.map((row) => ({ row, messages: projectSessionRow(row, toolCallIterations) }))
  };
}

function staleCotWorkReminderSuppressPolicy(context: NDXFinalMessagePipelineContext): NDXFinalMessagePipelineContext {
  const latestUserDataId = latestUserMessageDataId(context.rows);
  return suppressRows(context, "stale cot_work_reminder suppress", (state) => {
    const contents = state.row.contents;
    return Boolean(
      latestUserDataId &&
      contents &&
      typeof contents === "object" &&
      (contents as { kind?: unknown }).kind === "cot_work_reminder" &&
      isBeforeDataId(state.row.dataid, latestUserDataId)
    );
  });
}

function runtimeControlErrorSuppressPolicy(context: NDXFinalMessagePipelineContext): NDXFinalMessagePipelineContext {
  return suppressRows(context, "runtime-control error suppress", (state) => {
    const contents = state.row.contents;
    return Boolean(
      contents &&
      typeof contents === "object" &&
      (contents as { kind?: unknown }).kind === "error" &&
      typeof (contents as { message?: unknown }).message === "string" &&
      isRuntimeControlErrorMessage((contents as { message: string }).message)
    );
  });
}

function invalidToolFailurePairSuppressPolicy(context: NDXFinalMessagePipelineContext): NDXFinalMessagePipelineContext {
  const latestUserDataId = latestUserMessageDataId(context.rows);
  const suppressedToolCallIds = invalidToolArgumentCallIdsBeforeLatestUser(context.rows, latestUserDataId);
  if (!suppressedToolCallIds.size) {
    return context;
  }
  return {
    ...context,
    diagnostics: [...context.diagnostics, `invalid tool failure pair suppress: ${suppressedToolCallIds.size} call(s)`],
    rowStates: context.rowStates.map((state) => {
      const messages = state.messages.filter((message) => !suppressedToolCallIds.has(messageCallId(message)));
      return messages.length === state.messages.length
        ? state
        : { ...state, messages, suppressedBy: [...(state.suppressedBy ?? []), "invalid tool failure pair suppress"] };
    })
  };
}

function finalizeSessionHistoryPolicy(context: NDXFinalMessagePipelineContext): NDXFinalMessagePipelineContext {
  return {
    ...context,
    historyMessages: context.rowStates.flatMap((state) => state.messages)
  };
}

function inlineAttachmentProjectionPolicy(context: NDXFinalMessagePipelineContext): NDXFinalMessagePipelineContext {
  if (!context.inlineAttachmentDataIds.size) {
    return context;
  }
  return {
    ...context,
    inlineAttachmentMessages: context.rows.flatMap((row) => {
      const content = userMessageAttachmentParts(row, context.inlineAttachmentDataIds);
      return content.length > 0 ? [{ role: "user", content }] : [];
    })
  };
}

function projectSessionRow(row: NDXSessionDataRow, toolCallIterations: Set<number>): ResponseInputItem[] {
  if (!row.contents || typeof row.contents !== "object") {
    const text = sessionDataText(row);
    return row.type === "user" && text ? [{ role: "user", content: text }] : row.type === "assistant" && text ? [{ role: "assistant", content: text }] : [];
  }

  const contents = row.contents as Partial<NDXSessionDataContents>;
  if (contents.kind === "skill_context" && typeof contents.text === "string" && contents.text.trim().length > 0) {
    return [{ role: "user", content: contents.text }];
  }

  if (row.type === "user" || contents.kind === "tool_generated_user_message") {
    const content = sessionDataText({ type: "user", contents: row.contents });
    if (typeof content === "string" && !content.trim()) {
      return [];
    }
    return content === undefined ? [] : [{ role: "user", content }];
  }

  if (contents.kind === "tool_call" && Array.isArray(contents.toolCalls)) {
    return contents.toolCalls.filter((toolCall): toolCall is ResponseInputItem => Boolean(toolCall && typeof toolCall === "object" && !Array.isArray(toolCall)));
  }

  if (contents.kind === "tool_result" && Array.isArray(contents.results)) {
    return contents.results.map((result) => ({
      type: "function_call_output",
      call_id: result.toolCallId || "tool_call",
      output: stringifyToolOutput(result.output)
    }));
  }

  if (contents.kind === "cot_work_reminder") {
    const content = sessionDataText(row);
    return typeof content === "string" && content.trim().length > 0 ? [{ role: "user", content }] : [];
  }

  if (contents.kind === NDX_COMPACT_CONTENT_KIND) {
    const content = sessionDataText(row);
    return typeof content === "string" && content.trim().length > 0 ? [{ role: "user", content: `Session compact summary:\n${content}` }] : [];
  }

  if (contents.kind === NDX_COT_WORK_CONTENT_KIND) {
    return [];
  }

  if (contents.kind === "assistant_delta" && typeof contents.iteration === "number" && toolCallIterations.has(contents.iteration)) {
    return [];
  }

  if (contents.kind === "assistant_reasoning") {
    return [];
  }

  if (row.type === "assistant") {
    const content = sessionDataText(row);
    return typeof content === "string" && content.trim().length > 0 ? [{ role: "assistant", content }] : [];
  }

  return [];
}

function suppressRows(
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

function latestUserMessageDataId(rows: NDXSessionDataRow[]): string | undefined {
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

function invalidToolArgumentCallIdsBeforeLatestUser(rows: NDXSessionDataRow[], latestUserDataId: string | undefined): Set<string> {
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

function isBeforeDataId(dataid: string | number, boundary: string | undefined): boolean {
  if (!boundary) {
    return false;
  }
  const current = Number(dataid);
  const next = Number(boundary);
  return Number.isFinite(current) && Number.isFinite(next) && current < next;
}

function messageCallId(message: ResponseInputItem): string {
  if ("call_id" in message && typeof message.call_id === "string" && message.call_id.length > 0) {
    return message.call_id;
  }
  return "";
}

function isInvalidToolArgumentOutput(output: string): boolean {
  return /Bad control character in string literal in JSON|tool arguments must be valid JSON|Failed to parse tool call/i.test(output);
}

function isRuntimeControlErrorMessage(message: string): boolean {
  return /^Turn interrupted during /i.test(message) ||
    /^model response reasoning /i.test(message) ||
    /^model stream ended without assistant content or tool calls\.?$/i.test(message) ||
    /^model response failed: Failed to parse tool call/i.test(message);
}

function userMessageAttachmentParts(row: Pick<NDXSessionDataRow, "contents" | "dataid">, inlineAttachmentDataIds: Set<string>): Array<Record<string, unknown>> {
  const contents = row.contents;
  if (!contents || typeof contents !== "object") {
    return [];
  }
  const payload = contents as { kind?: unknown; attachments?: unknown };
  if ((payload.kind !== "user_message" && payload.kind !== "tool_generated_user_message") || !Array.isArray(payload.attachments)) {
    return [];
  }
  if (!inlineAttachmentDataIds.has(String(row.dataid))) {
    return [];
  }
  const parts: Record<string, unknown>[] = [];
  for (const attachment of payload.attachments) {
    if (!attachment || typeof attachment !== "object") {
      continue;
    }
    const next = attachment as NDXSessionAttachmentReference;
    if (next.kind === "image") {
      parts.push({ type: "input_image", file_path: next.path, mime_type: next.mimeType, ndx_dataid: String(row.dataid) });
    } else {
      parts.push({ type: "input_file", filename: next.name, file_path: next.path, mime_type: next.mimeType, ndx_dataid: String(row.dataid) });
    }
  }
  return parts;
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === null || typeof output === "undefined") return "tool result unavailable";
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function isNonEmptyResponseInputItem(message: ResponseInputItem): boolean {
  if (!("content" in message)) {
    return true;
  }
  return typeof message.content === "string" ? message.content.trim().length > 0 : Array.isArray(message.content) ? message.content.length > 0 : true;
}

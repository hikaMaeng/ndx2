import { buildContextParts } from "../../../context/index.js";
import { listSessionDataForModelContext } from "../../../compact/index.js";
import { listInlineAttachmentDataIds } from "../../../session/runtimeData.js";
import { sessionDataRowsToInlineAttachmentMessages, sessionDataRowsToModelMessages } from "../../../session/sessionDataRowsToModelMessages.js";
import { serverContainerUserHome, toServerProjectPath } from "../../../../common/server-path/index.js";
import type { NDXDatabase, NDXModelMessage, NDXSessionDataRow, NDXSessionRow } from "../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export type NDXTurnMessageParts = {
  developer: NDXModelMessage;
  user: NDXModelMessage;
  history: ResponseInputItem[];
  inlineAttachments?: ResponseInputItem[];
  historyRows?: NDXSessionDataRow[];
};

export async function buildTurnMessages(database: NDXDatabase, runningSession: NDXSessionRow): Promise<ResponseInputItem[]> {
  const parts = await buildTurnMessageParts(database, runningSession);
  return buildTurnMessagesFromParts(parts);
}

export async function buildTurnMessageParts(database: NDXDatabase, runningSession: NDXSessionRow): Promise<NDXTurnMessageParts> {
  const parts = await buildTurnBaseMessageParts(runningSession);
  const historyRows = await listSessionDataForModelContext(database, runningSession.sessionid);
  const inlineAttachmentDataIds = await listInlineAttachmentDataIds(database, runningSession.sessionid);
  return {
    ...parts,
    historyRows,
    history: sessionDataRowsToModelMessages(historyRows),
    inlineAttachments: sessionDataRowsToInlineAttachmentMessages(historyRows, inlineAttachmentDataIds)
  };
}

export async function buildTurnBaseMessageParts(runningSession: NDXSessionRow): Promise<NDXTurnMessageParts> {
  const projectHome = toServerProjectPath(runningSession.path);
  const context = await buildContextParts({
    model: runningSession.model,
    cwd: projectHome,
    userHome: serverContainerUserHome(),
    projectHome
  });
  return {
    developer: { role: "system" as const, content: context.developer },
    user: { role: "user" as const, content: [context.userInstructions, context.environment].filter((section) => section.length > 0).join("\n\n") },
    history: [],
    inlineAttachments: []
  };
}

export function buildTurnMessagesFromParts(parts: NDXTurnMessageParts): ResponseInputItem[] {
  return [
    parts.developer,
    parts.user,
    ...parts.history,
    ...(parts.inlineAttachments ?? [])
  ].filter((message) => isNonEmptyResponseInputItem(message));
}

function isNonEmptyResponseInputItem(message: ResponseInputItem): boolean {
  if (!("content" in message)) {
    return true;
  }
  return typeof message.content === "string" ? message.content.trim().length > 0 : Array.isArray(message.content) ? message.content.length > 0 : true;
}

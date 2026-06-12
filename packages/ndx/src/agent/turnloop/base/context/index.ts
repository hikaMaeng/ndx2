import { buildContextParts } from "../../../context/index.js";
import { listSessionDataForModelContext } from "../../../compact/index.js";
import { listInlineAttachmentDataIds } from "../../../session/runtimeData.js";
import { serverContainerUserHome, toServerProjectPath } from "../../../../common/server-path/index.js";
import { buildFinalModelMessagesFromParts, buildFinalSessionMessages } from "../../model-call/finalMessages/index.js";
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
  const finalSessionMessages = buildFinalSessionMessages(historyRows, inlineAttachmentDataIds);
  return {
    ...parts,
    historyRows,
    history: finalSessionMessages.history,
    inlineAttachments: finalSessionMessages.inlineAttachments
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
  return buildFinalModelMessagesFromParts(parts);
}

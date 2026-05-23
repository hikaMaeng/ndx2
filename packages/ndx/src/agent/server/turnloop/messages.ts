import { buildContext } from "../context/index.js";
import { listSessionData } from "../session/listSessionData.js";
import { sessionDataRowsToModelMessages } from "../session/sessionDataRowsToModelMessages.js";
import { serverContainerUserHome, toServerProjectPath } from "../../../server/common/index.js";
import type { NDXDatabase, NDXModelMessage, NDXSessionRow } from "../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export type NDXTurnMessageParts = {
  developer: NDXModelMessage;
  user: NDXModelMessage;
  history: ResponseInputItem[];
};

export async function buildTurnMessages(database: NDXDatabase, runningSession: NDXSessionRow): Promise<ResponseInputItem[]> {
  const parts = await buildTurnMessageParts(database, runningSession);
  return buildTurnMessagesFromParts(parts);
}

export async function buildTurnMessageParts(database: NDXDatabase, runningSession: NDXSessionRow): Promise<NDXTurnMessageParts> {
  const parts = await buildTurnBaseMessageParts(runningSession);
  return {
    ...parts,
    history: sessionDataRowsToModelMessages(await listSessionData(database, runningSession.sessionid)),
  };
}

export async function buildTurnBaseMessageParts(runningSession: NDXSessionRow): Promise<NDXTurnMessageParts> {
  const projectHome = toServerProjectPath(runningSession.path);
  const context = await buildContext({
    model: runningSession.model,
    cwd: projectHome,
    userHome: serverContainerUserHome(),
    projectHome
  });
  return {
    developer: { role: "system" as const, content: context.developer },
    user: { role: "user" as const, content: context.user },
    history: [],
  };
}

export function buildTurnMessagesFromParts(parts: NDXTurnMessageParts): ResponseInputItem[] {
  return [parts.developer, parts.user, ...parts.history].filter((message) => isNonEmptyResponseInputItem(message));
}

function isNonEmptyResponseInputItem(message: ResponseInputItem): boolean {
  if (!("content" in message)) {
    return true;
  }
  return typeof message.content === "string" ? message.content.trim().length > 0 : Array.isArray(message.content) ? message.content.length > 0 : true;
}

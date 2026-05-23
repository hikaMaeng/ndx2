import { buildContext } from "../context/index.js";
import { listSessionData } from "../session/listSessionData.js";
import { sessionDataRowsToModelMessages } from "../session/sessionDataRowsToModelMessages.js";
import { serverContainerUserHome, toServerProjectPath } from "../../../server/common/index.js";
import type { NDXDatabase, NDXModelMessage, NDXSessionRow } from "../session/types.js";

export type NDXTurnMessageParts = {
  developer: NDXModelMessage;
  user: NDXModelMessage;
  history: NDXModelMessage[];
};

export async function buildTurnMessages(database: NDXDatabase, runningSession: NDXSessionRow): Promise<NDXModelMessage[]> {
  const parts = await buildTurnMessageParts(database, runningSession);
  return [parts.developer, parts.user, ...parts.history].filter((message) => typeof message.content === "string" ? message.content.trim().length > 0 : message.content.length > 0);
}

export async function buildTurnMessageParts(database: NDXDatabase, runningSession: NDXSessionRow): Promise<NDXTurnMessageParts> {
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
    history: sessionDataRowsToModelMessages(await listSessionData(database, runningSession.sessionid)),
  };
}

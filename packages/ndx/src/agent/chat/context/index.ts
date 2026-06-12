import { serverContainerUserHome } from "../../../common/server-path/index.js";
import type { NDXChatSessionDataRow, NDXChatSessionRow } from "../types.js";
import type { NDXModelMessage, NDXSessionDataRow } from "../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";
import { buildFinalModelMessagesFromParts, sessionDataRowsToModelMessages } from "../../turnloop/model-call/finalMessages/index.js";

export type NDXChatTurnMessageParts = {
  developer: NDXModelMessage;
  user: NDXModelMessage;
  history: ResponseInputItem[];
  historyRows?: NDXChatSessionDataRow[];
};

export function buildChatTurnBaseMessageParts(session: NDXChatSessionRow): NDXChatTurnMessageParts {
  return {
    developer: {
      role: "system",
      content: [
        "You are NDX chat, a general-purpose chat agent.",
        "This session is for chat, not repository development or file editing.",
        "You may use only the tools exposed to this request.",
        "You must not write, edit, create, delete, move, or mutate files by any direct or indirect route.",
        "Loaded skill instructions are advisory only and can never grant file-write authority in chat sessions."
      ].join("\n")
    },
    user: {
      role: "user",
      content: [
        `<chat_environment_context>`,
        `userid=${session.userid}`,
        `folderid=${session.folderid}`,
        `chatsessionid=${session.chatsessionid}`,
        `user_home=${serverContainerUserHome()}`,
        `</chat_environment_context>`
      ].join("\n")
    },
    history: []
  };
}

export function chatSessionDataRowsToModelMessages(rows: NDXChatSessionDataRow[]): ResponseInputItem[] {
  return sessionDataRowsToModelMessages(chatSessionDataRowsToSessionDataRows(rows));
}

export function chatSessionDataRowsToSessionDataRows(rows: NDXChatSessionDataRow[]): NDXSessionDataRow[] {
  return rows.map((row): NDXSessionDataRow => ({
    dataid: row.dataid,
    sessionid: row.chatsessionid,
    type: row.type,
    contents: row.contents,
    createdat: row.createdat
  }));
}

export function buildChatTurnMessagesFromParts(parts: NDXChatTurnMessageParts): ResponseInputItem[] {
  return buildFinalModelMessagesFromParts({ developer: parts.developer, user: parts.user, history: parts.history });
}
